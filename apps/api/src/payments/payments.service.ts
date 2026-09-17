import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  convertMinor,
  DomainEvents,
  PaymentMethod,
  PaymentType,
  RecordPaymentDto,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../common/event-bus.service';
import { AuditService } from '../common/audit.service';
import { IdempotencyService } from '../common/idempotency.service';
import { FxService } from '../fx/fx.service';
import { CashDrawerService } from './cash-drawer.service';
import { Actor } from '../common/actor';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly fx: FxService,
    private readonly cashDrawer: CashDrawerService,
  ) {}

  async getFolio(hotelId: string, reservationId: string) {
    const folio = await this.prisma.folio.findFirst({
      where: { reservationId, reservation: { hotelId } },
      include: { lineItems: { orderBy: { at: 'asc' } }, payments: true },
    });
    if (!folio) throw new NotFoundException('Folio not found');
    return folio;
  }

  /**
   * Record a payment against a reservation's folio. The folio is kept in the
   * hotel base currency; a foreign-currency payment is converted via `fxRate`
   * (plan.md §6.3, multi-currency). Idempotent on `idempotencyKey`.
   */
  async recordPayment(
    actor: Actor,
    reservationId: string,
    dto: RecordPaymentDto,
  ) {
    return this.idempotency.run(
      {
        key: dto.idempotencyKey,
        hotelId: actor.hotelId,
        method: 'POST',
        path: `/reservations/${reservationId}/payments`,
      },
      () => this.recordInner(actor, reservationId, dto),
    );
  }

  private async recordInner(
    actor: Actor,
    reservationId: string,
    dto: RecordPaymentDto,
  ) {
    const folio = await this.prisma.folio.findFirst({
      where: { reservationId, reservation: { hotelId: actor.hotelId } },
    });
    if (!folio) throw new NotFoundException('Folio not found');

    const paidCurrency = dto.currency ?? folio.currency;
    // Use an explicit override if provided; otherwise fetch a live rate.
    // Same-currency payments need no conversion (rate 1).
    let fxRate = 1;
    if (paidCurrency !== folio.currency) {
      fxRate = dto.fxRate ?? (await this.fx.getRate(paidCurrency, folio.currency));
    }
    const baseAmount = convertMinor(
      dto.amount,
      paidCurrency,
      folio.currency,
      fxRate,
    );
    // Refunds reduce the paid total.
    const signedBase =
      dto.type === PaymentType.REFUND ? -Math.abs(baseAmount) : baseAmount;

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          hotelId: actor.hotelId,
          folioId: folio.id,
          reservationId,
          amount: dto.amount,
          currency: paidCurrency,
          fxRate: new Prisma.Decimal(fxRate),
          baseAmount: signedBase,
          method: dto.method,
          type: dto.type,
          reference: dto.reference,
          recordedById: actor.id ?? 'system',
          recordedByType: actor.type,
        },
      });

      const totalPaid = folio.totalPaid + signedBase;
      const updatedFolio = await tx.folio.update({
        where: { id: folio.id },
        data: { totalPaid, balance: folio.totalCharges - totalPaid },
      });

      // Cash accrues to the cashier's open drawer shift for reconciliation.
      if (dto.method === PaymentMethod.CASH && actor.id) {
        await this.cashDrawer.applyCash(actor.hotelId, actor.id, signedBase, tx);
      }

      await this.audit.record(
        {
          actor,
          action: `payment.${dto.type.toLowerCase()}`,
          entity: 'Payment',
          entityId: payment.id,
          after: payment,
        },
        tx,
      );
      return { payment, folio: updatedFolio };
    });

    await this.events.emit(DomainEvents.PaymentRecorded, {
      hotelId: actor.hotelId,
      paymentId: result.payment.id,
      reservationId,
      folioId: folio.id,
      amount: result.payment.baseAmount,
      balance: result.folio.balance,
    });

    return {
      paymentId: result.payment.id,
      balance: result.folio.balance,
      totalPaid: result.folio.totalPaid,
      currency: result.folio.currency,
    };
  }
}
