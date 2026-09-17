import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PaymentMethod, PaymentType } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, systemActor } from '../common/actor';
import { PaymentsService } from './payments.service';

export interface CreateDvaDto {
  amountMinor?: number;
  bankName?: string;
  expiresInHours?: number;
}

export interface ReconcileTransferDto {
  accountNumber?: string;
  reference?: string;
  amountMinor: number;
  senderName?: string;
  bankSessionId?: string;
}

@Injectable()
export class DynamicAccountsService {
  private readonly logger = new Logger(DynamicAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Provision or fetch an active Dynamic Virtual Account for a guest reservation.
   */
  async getOrCreateForReservation(
    actor: Actor,
    reservationId: string,
    dto?: CreateDvaDto,
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, hotelId: actor.hotelId },
      include: { guest: true, folio: true, hotel: true },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    // Check for an existing ACTIVE virtual account
    const existing = await this.prisma.dynamicVirtualAccount.findFirst({
      where: {
        hotelId: actor.hotelId,
        reservationId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (existing) {
      return existing;
    }

    // Generate unique 10-digit virtual NUBAN account number
    let accountNumber = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      attempts++;
      // 99-prefix is commonly used by Nigerian fintechs/MFBs for dynamic virtual accounts
      const randomDigits = Math.floor(10000000 + Math.random() * 90000000).toString();
      accountNumber = `99${randomDigits}`;
      const found = await this.prisma.dynamicVirtualAccount.findUnique({
        where: {
          hotelId_accountNumber: {
            hotelId: actor.hotelId,
            accountNumber,
          },
        },
      });
      if (!found) isUnique = true;
    }

    const shortRes = reservationId.slice(0, 6).toUpperCase();
    const guestFirstName = reservation.guest.name.split(' ')[0] || 'Guest';
    const hotelPrefix = reservation.hotel.name.slice(0, 10).trim();
    const accountName = `${hotelPrefix} / ${guestFirstName} (${shortRes})`;
    const reference = `DVA_${reservationId.replace(/-/g, '').slice(0, 12)}_${randomBytes(4).toString('hex')}`;
    const bankName = dto?.bankName || 'Providus Bank / Moniepoint MFB';

    const hours = dto?.expiresInHours ?? 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const dva = await this.prisma.dynamicVirtualAccount.create({
      data: {
        hotelId: actor.hotelId,
        reservationId,
        accountNumber,
        bankName,
        accountName,
        reference,
        amountExpectedMinor: dto?.amountMinor ?? reservation.folio?.balance ?? reservation.quotedPrice,
        status: 'ACTIVE',
        expiresAt,
        metadata: {
          guestName: reservation.guest.name,
          guestPhone: reservation.guest.phone,
        },
      },
    });

    this.logger.log(`Created DVA ${accountNumber} for reservation ${reservationId}`);
    return dva;
  }

  async listForReservation(hotelId: string, reservationId: string) {
    return this.prisma.dynamicVirtualAccount.findMany({
      where: { hotelId, reservationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listActive(hotelId: string) {
    return this.prisma.dynamicVirtualAccount.findMany({
      where: { hotelId, status: 'ACTIVE' },
      include: {
        reservation: {
          select: {
            id: true,
            status: true,
            guest: { select: { name: true, phone: true } },
            room: { select: { roomNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Reconcile incoming bank transfer to the corresponding DVA and record the payment.
   */
  async reconcileTransfer(actor: Actor, dto: ReconcileTransferDto) {
    if (!dto.accountNumber && !dto.reference) {
      throw new BadRequestException('Either accountNumber or reference is required');
    }

    const dva = await this.prisma.dynamicVirtualAccount.findFirst({
      where: {
        hotelId: actor.hotelId,
        ...(dto.accountNumber ? { accountNumber: dto.accountNumber } : {}),
        ...(dto.reference ? { reference: dto.reference } : {}),
      },
      include: {
        reservation: {
          include: { folio: true },
        },
      },
    });

    if (!dva) {
      throw new NotFoundException('Virtual account not found for transfer reconciliation');
    }

    const reservation = dva.reservation;
    const actorToUse = actor.type === 'SYSTEM' ? systemActor(dva.hotelId) : actor;

    const paymentResult = await this.payments.recordPayment(actorToUse, dva.reservationId, {
      amount: dto.amountMinor,
      currency: reservation.folio?.currency ?? reservation.currency,
      method: PaymentMethod.TRANSFER,
      type: PaymentType.BALANCE,
      reference: dto.bankSessionId ?? `TRF_${dva.accountNumber}_${Date.now()}`,
      idempotencyKey: `dva:recon:${dto.bankSessionId ?? dva.reference}:${dto.amountMinor}`,
    });

    // Mark virtual account received or partially received
    await this.prisma.dynamicVirtualAccount.update({
      where: { id: dva.id },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        metadata: {
          ...(typeof dva.metadata === 'object' && dva.metadata !== null ? dva.metadata : {}),
          reconciledAmountMinor: dto.amountMinor,
          senderName: dto.senderName,
          bankSessionId: dto.bankSessionId,
        },
      },
    });

    // Auto-confirm held reservation if now settled
    if (reservation.status === 'HELD') {
      await this.prisma.reservation.update({
        where: { id: dva.reservationId },
        data: { status: 'CONFIRMED', holdExpiresAt: null },
      });
    }

    return {
      success: true,
      virtualAccountId: dva.id,
      accountNumber: dva.accountNumber,
      reservationId: dva.reservationId,
      amountMinor: dto.amountMinor,
      newBalance: paymentResult.balance,
      totalPaid: paymentResult.totalPaid,
    };
  }
}
