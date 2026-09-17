import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Channel,
  DomainEvents,
  formatMoney,
  PaymentRecordedPayload,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { WhatsAppQueueService } from './whatsapp-queue.service';
import { EmailService } from './email.service';

/**
 * Sends a WhatsApp receipt when a payment is recorded (plan.md §5, §8). Free
 * inside the 24h service window; otherwise a utility template would be required
 * (logged here until templates are registered).
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly queue: WhatsAppQueueService,
    private readonly email: EmailService,
  ) {}

  @OnEvent(DomainEvents.PaymentRecorded)
  async onPaymentRecorded(payload: PaymentRecordedPayload): Promise<void> {
    try {
      if (!payload.reservationId) return;
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: payload.reservationId },
        include: { guest: true, folio: true },
      });
      const guest = reservation?.guest;
      if (!reservation || !guest) return;
      const to = guest.whatsappId ?? guest.phone;
      if (!to) return;

      const currency = reservation.folio?.currency ?? reservation.currency;
      const body =
        `Payment received: ${formatMoney(payload.amount, currency)}.\n` +
        `Outstanding balance: ${formatMoney(payload.balance, currency)}.\n` +
        `Thank you for choosing us!`;

      const conversation = await this.messaging.getOrCreateConversation({
        hotelId: payload.hotelId,
        channel: Channel.WHATSAPP,
        externalId: to,
        guestId: guest.id,
      });
      const inWindow = await this.messaging.isWithinServiceWindow(conversation.id);

      await this.queue.enqueueText(to, body);
      if (!inWindow) {
        this.logger.warn(
          `Receipt queued outside 24h window for ${to}; a utility template is recommended.`,
        );
      }
      await this.messaging.recordOutbound(conversation.id, body, {
        templateName: inWindow ? undefined : 'payment_receipt',
      });
      // Also email the receipt when we have an address.
      if (guest.email) {
        await this.email.send(guest.email, 'Your payment receipt', body);
      }
    } catch (e) {
      this.logger.error(`Failed to send receipt: ${e}`);
    }
  }

  /** Email a booking confirmation when a reservation is created. */
  @OnEvent(DomainEvents.ReservationCreated)
  async onReservationCreated(payload: { hotelId: string; reservationId: string }): Promise<void> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: payload.reservationId },
        include: { guest: true, room: true, roomType: true },
      });
      if (!reservation?.guest?.email) return;
      const body =
        `Hi ${reservation.guest.name}, your booking is confirmed.\n` +
        `${reservation.roomType.name}${reservation.room ? ` (Room ${reservation.room.roomNumber})` : ''}\n` +
        `${reservation.checkInDate.toDateString()} → ${reservation.checkOutDate.toDateString()}\n` +
        `Reference: ${reservation.id.slice(0, 8)}`;
      await this.email.send(reservation.guest.email, 'Booking confirmation', body);
    } catch (e) {
      this.logger.error(`Failed to send booking confirmation: ${e}`);
    }
  }
}
