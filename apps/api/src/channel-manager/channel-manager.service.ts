import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActorType,
  BLOCKING_RESERVATION_STATUSES,
  ChannelType,
  ReservationSource,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { PricingService } from '../rates/pricing.service';
import { ReservationsService } from '../reservations/reservations.service';
import { Actor, systemActor } from '../common/actor';

const DAY = 86_400_000;

export interface OtaReservationPayload {
  externalId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
}

/**
 * Channel manager (plan.md §4 distribution). Manages OTA connections, pushes
 * availability + rates, and ingests OTA reservations (deduped). The generic
 * adapter + inbound webhook are fully functional; live Booking.com/Expedia/
 * Airbnb connectivity additionally requires each provider's certified API
 * credentials, which plug into `pushInventory`/the webhook parser.
 */
@Injectable()
export class ChannelManagerService {
  private readonly logger = new Logger(ChannelManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
    private readonly reservations: ReservationsService,
  ) {}

  connect(actor: Actor, input: { channel: ChannelType; name: string; credentials?: Record<string, unknown> }) {
    return this.prisma.channelConnection.create({
      data: { hotelId: actor.hotelId, channel: input.channel, name: input.name, credentials: (input.credentials ?? {}) as object },
    });
  }

  list(hotelId: string) {
    return this.prisma.channelConnection.findMany({ where: { hotelId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Compute the availability + rate feed (next `days` days) that would be pushed
   * to channels, and mark the connection synced. Live providers send this over
   * their connectivity API; the generic connection records the snapshot.
   */
  async pushInventory(actor: Actor, connectionId: string, days = 14) {
    const conn = await this.prisma.channelConnection.findFirst({
      where: { id: connectionId, hotelId: actor.hotelId, active: true },
    });
    if (!conn) throw new NotFoundException('Channel connection not found');

    const roomTypes = await this.prisma.roomType.findMany({ where: { hotelId: actor.hotelId } });
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const feed: { roomTypeId: string; date: string; available: number; price: number }[] = [];

    for (const rt of roomTypes) {
      const totalRooms = await this.prisma.room.count({ where: { hotelId: actor.hotelId, roomTypeId: rt.id, deletedAt: null } });
      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * DAY);
        const next = new Date(d.getTime() + DAY);
        const booked = await this.prisma.reservation.count({
          where: {
            hotelId: actor.hotelId, roomTypeId: rt.id,
            status: { in: BLOCKING_RESERVATION_STATUSES as never },
            checkInDate: { lt: next }, checkOutDate: { gt: d },
          },
        });
        const q = await this.pricing.quote(actor.hotelId, rt.id, d, next);
        feed.push({ roomTypeId: rt.id, date: d.toISOString().slice(0, 10), available: Math.max(0, totalRooms - booked), price: q.total });
      }
    }
    await this.prisma.channelConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } });
    this.logger.log(`Pushed ${feed.length} availability/rate rows to ${conn.channel} (${conn.name})`);
    await this.audit.record({ actor, action: 'channel.push', entity: 'ChannelConnection', entityId: conn.id, after: { rows: feed.length } });
    return { channel: conn.channel, pushed: feed.length, feed };
  }

  /** Ingest an OTA reservation (idempotent by externalId). */
  async ingestReservation(hotelId: string, channel: ChannelType, payload: OtaReservationPayload) {
    const existing = await this.prisma.channelReservation.findUnique({
      where: { hotelId_channel_externalId: { hotelId, channel, externalId: payload.externalId } },
    });
    if (existing?.reservationId) {
      return { reservationId: existing.reservationId, deduped: true };
    }

    const actor: Actor = { ...systemActor(hotelId), type: ActorType.SYSTEM };
    const reservation = await this.reservations.create(actor, {
      guest: { name: payload.guestName, phone: payload.guestPhone ?? `ota:${payload.externalId}`, email: payload.guestEmail },
      roomTypeId: payload.roomTypeId,
      checkIn: new Date(payload.checkIn),
      checkOut: new Date(payload.checkOut),
      adults: payload.adults ?? 1,
      children: 0,
      source: ReservationSource.OTA,
    });
    await this.prisma.channelReservation.create({
      data: { hotelId, channel, externalId: payload.externalId, reservationId: reservation.id, raw: payload as unknown as object },
    });
    this.logger.log(`Ingested ${channel} reservation ${payload.externalId} → ${reservation.id}`);
    return { reservationId: reservation.id, deduped: false };
  }
}
