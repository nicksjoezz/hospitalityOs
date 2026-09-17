import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PaymentType } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, systemActor } from '../common/actor';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './providers/paystack.provider';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import {
  buildReference,
  PaymentProvider,
  reservationFromReference,
} from './providers/payment-gateway';

/** Orchestrates online-payment providers and their webhooks (plan.md §4, §8). */
@Injectable()
export class PaymentsGatewayService {
  private readonly logger = new Logger(PaymentsGatewayService.name);
  private readonly providers: Record<string, PaymentProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    paystack: PaystackProvider,
    flutterwave: FlutterwaveProvider,
  ) {
    this.providers = { paystack, flutterwave };
  }

  private provider(name: string): PaymentProvider {
    const p = this.providers[name.toLowerCase()];
    if (!p) throw new NotFoundException(`Unknown payment provider: ${name}`);
    return p;
  }

  async initialize(
    actor: Actor,
    providerName: string,
    reservationId: string,
    amount: number,
  ) {
    const provider = this.provider(providerName);
    if (!provider.isConfigured()) {
      throw new BadRequestException(`${providerName} is not configured`);
    }
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, hotelId: actor.hotelId },
      include: { guest: true, folio: true },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    const nonce = randomBytes(6).toString('hex');
    const reference = buildReference(reservationId, nonce);
    const result = await provider.initialize({
      reference,
      amount,
      currency: reservation.folio?.currency ?? reservation.currency,
      email: reservation.guest.email ?? `${reservation.guest.phone}@guest.hospitalityos`,
    });
    return { ...result, provider: providerName };
  }

  /** Verify a provider webhook and record the payment idempotently on success. */
  async handleWebhook(
    providerName: string,
    rawBody: Buffer | undefined,
    headers: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    const provider = this.provider(providerName);
    const event = provider.verifyAndParse(rawBody, headers);
    if (!event.ok) return { ok: false };
    if (!event.success || !event.reference || !event.amount) return { ok: true };

    const reservationId = reservationFromReference(event.reference);
    if (!reservationId) {
      this.logger.warn(`Webhook reference without reservation: ${event.reference}`);
      return { ok: true };
    }
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { hotelId: true },
    });
    if (!reservation) return { ok: true };

    const actor: Actor = systemActor(reservation.hotelId);
    await this.payments.recordPayment(actor, reservationId, {
      amount: event.amount,
      currency: event.currency,
      method: event.method,
      type: PaymentType.DEPOSIT,
      reference: event.reference,
      idempotencyKey: `pay:${event.reference}`, // dedupe provider retries
    });
    // A paid HELD (e.g. online) booking is now confirmed.
    const full = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { status: true },
    });
    if (full?.status === 'HELD') {
      await this.prisma.reservation.update({
        where: { id: reservationId },
        data: { status: 'CONFIRMED', holdExpiresAt: null },
      });
    }
    return { ok: true };
  }
}
