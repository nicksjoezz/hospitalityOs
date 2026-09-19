import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActorType,
  BLOCKING_RESERVATION_STATUSES,
  ChannelType,
  ReservationSource,
  ReservationStatus,
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

  /** Export an RFC 5545 iCalendar feed for a room type. */
  async exportIcal(roomTypeId: string): Promise<string> {
    const rt = await this.prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!rt) throw new NotFoundException('Room type not found');

    const reservations = await this.prisma.reservation.findMany({
      where: {
        roomTypeId,
        status: { in: BLOCKING_RESERVATION_STATUSES as never },
        checkOutDate: { gte: new Date(Date.now() - 30 * DAY) },
      },
      select: {
        id: true,
        checkInDate: true,
        checkOutDate: true,
        source: true,
        status: true,
      },
    });

    const formatDt = (d: Date) => {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    };

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HospitalityOS//iCal Engine//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${rt.name} - HospitalityOS`,
    ];

    for (const r of reservations) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${r.id}@hospitalityos`);
      lines.push(`DTSTAMP:${formatDt(new Date())}T000000Z`);
      lines.push(`DTSTART;VALUE=DATE:${formatDt(r.checkInDate)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDt(r.checkOutDate)}`);
      lines.push(`SUMMARY:Reserved (${r.source})`);
      lines.push(`DESCRIPTION:HospitalityOS Reservation ${r.id.slice(0, 8)}`);
      lines.push(`STATUS:${r.status === ReservationStatus.CONFIRMED ? 'CONFIRMED' : 'TENTATIVE'}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  /** Import and sync remote iCal (e.g. from Airbnb or Booking.com). */
  async syncExternalIcal(
    actor: Actor,
    input: { roomTypeId: string; icalUrl: string; channelName?: string },
  ) {
    if (!input.icalUrl.startsWith('http://') && !input.icalUrl.startsWith('https://')) {
      throw new BadRequestException('Valid http/https iCal URL required');
    }
    const res = await fetch(input.icalUrl, { headers: { 'User-Agent': 'HospitalityOS-iCal/1.0' } });
    if (!res.ok) {
      throw new BadRequestException(`Failed to fetch remote iCal: HTTP ${res.status}`);
    }
    const text = await res.text();

    const channel = input.channelName?.toUpperCase().includes('AIRBNB')
      ? ChannelType.AIRBNB
      : input.channelName?.toUpperCase().includes('BOOKING')
      ? ChannelType.BOOKING_COM
      : ChannelType.GENERIC;

    const eventBlocks = text.split('BEGIN:VEVENT');
    let importedCount = 0;

    for (let i = 1; i < eventBlocks.length; i++) {
      const block = eventBlocks[i].split('END:VEVENT')[0];
      const uidMatch = block.match(/UID:(.+?)(\r|\n)/);
      const dtStartMatch = block.match(/DTSTART(?:;[^:]+)?:(\d{8}(?:T\d{6}Z?)?)/);
      const dtEndMatch = block.match(/DTEND(?:;[^:]+)?:(\d{8}(?:T\d{6}Z?)?)/);
      const summaryMatch = block.match(/SUMMARY:(.+?)(\r|\n)/);

      if (!dtStartMatch || !dtEndMatch) continue;

      const uid = uidMatch ? uidMatch[1].trim() : `ical-${Date.now()}-${i}`;
      const parseDateStr = (raw: string) => {
        const y = parseInt(raw.slice(0, 4), 10);
        const m = parseInt(raw.slice(4, 6), 10) - 1;
        const d = parseInt(raw.slice(6, 8), 10);
        return new Date(Date.UTC(y, m, d, 14, 0, 0));
      };

      const checkIn = parseDateStr(dtStartMatch[1]);
      const checkOut = parseDateStr(dtEndMatch[1]);

      if (checkOut <= checkIn) continue;

      try {
        await this.ingestReservation(actor.hotelId, channel, {
          externalId: uid,
          guestName: summaryMatch ? summaryMatch[1].trim() : `${input.channelName || 'OTA'} Guest`,
          roomTypeId: input.roomTypeId,
          checkIn: checkIn.toISOString().slice(0, 10),
          checkOut: checkOut.toISOString().slice(0, 10),
        });
        importedCount++;
      } catch (err: any) {
        this.logger.warn(`Could not import iCal event ${uid}: ${err?.message}`);
      }
    }

    await this.audit.record({
      actor,
      action: 'channel.ical_sync',
      entity: 'ChannelConnection',
      entityId: input.roomTypeId,
      after: { channel, importedCount, url: input.icalUrl },
    });

    return {
      ok: true,
      channel,
      eventsProcessed: eventBlocks.length - 1,
      importedCount,
      message: `Successfully synchronized ${importedCount} reservation(s) from ${input.channelName || 'iCal'}!`,
    };
  }

  /**
   * Google Hotel Center - Listings XML Feed
   * Outputs standard Google Hotel Center hotel definition XML for free booking links & ads.
   */
  async exportGoogleHotelsXml(hotelId: string): Promise<string> {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException('Hotel not found');

    const escapeXml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return `<?xml version="1.0" encoding="UTF-8"?>
<listings>
  <listing>
    <id>${escapeXml(hotel.id)}</id>
    <name>${escapeXml(hotel.name)}</name>
    <address format="simple">${escapeXml(hotel.name)}, HospitalityOS</address>
    <phone>${escapeXml(hotel.phone ?? '+1234567890')}</phone>
    <country>NG</country>
    <currency>${escapeXml(hotel.currency)}</currency>
  </listing>
</listings>`;
  }

  /**
   * Google Hotel Center - Availability, Rates, and Inventory (ARI) Transaction Feed
   * Standard Google Transaction XML syntax consumed by Google Hotel Ads and Free Booking Links.
   */
  async exportGoogleAriXml(hotelId: string, days = 14): Promise<string> {
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException('Hotel not found');

    const roomTypes = await this.prisma.roomType.findMany({ where: { hotelId } });
    const escapeXml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);

    let roomDataXml = '';
    let packageDataXml = '';

    for (const rt of roomTypes) {
      const totalRooms = await this.prisma.room.count({
        where: { hotelId, roomTypeId: rt.id, deletedAt: null },
      });

      roomDataXml += `
      <room room_type_id="${escapeXml(rt.id)}">
        <name>${escapeXml(rt.name)}</name>
        <capacity>${rt.capacity}</capacity>
      </room>`;

      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * DAY);
        const next = new Date(d.getTime() + DAY);
        const booked = await this.prisma.reservation.count({
          where: {
            hotelId,
            roomTypeId: rt.id,
            status: { in: BLOCKING_RESERVATION_STATUSES as never },
            checkInDate: { lt: next },
            checkOutDate: { gt: d },
          },
        });
        const quote = await this.pricing.quote(hotelId, rt.id, d, next);
        const available = Math.max(0, totalRooms - booked);
        const dateStr = d.toISOString().slice(0, 10);

        packageDataXml += `
      <package rate_plan_id="STD_${escapeXml(rt.id)}">
        <room_type_id>${escapeXml(rt.id)}</room_type_id>
        <date>${dateStr}</date>
        <availability>${available}</availability>
        <charge type="room" currency="${escapeXml(hotel.currency)}">
          <amount>${(quote.total / 100).toFixed(2)}</amount>
        </charge>
      </package>`;
      }
    }

    const timestamp = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<transaction timestamp="${timestamp}" id="HOS_ARI_${Date.now()}">
  <propertyDataSet property="${escapeXml(hotel.id)}">
    <roomData>${roomDataXml}
    </roomData>
    <packageData>${packageDataXml}
    </packageData>
  </propertyDataSet>
</transaction>`;
  }
}
