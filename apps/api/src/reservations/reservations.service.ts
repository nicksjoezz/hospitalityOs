import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  ActorType,
  AvailabilityDto,
  BLOCKING_RESERVATION_STATUSES,
  CreateReservationDto,
  DomainEvents,
  LineType,
  ModifyReservationDto,
  QuoteDto,
  ReservationSource,
  ReservationStatus,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../common/event-bus.service';
import { AuditService } from '../common/audit.service';
import { IdempotencyService } from '../common/idempotency.service';
import { CryptoService } from '../common/crypto.service';
import { PricingService } from '../rates/pricing.service';
import { AppConfig } from '../config/configuration';
import { Actor, systemActor } from '../common/actor';
import { nightsBetween } from './pricing';

/** Postgres exclusion_violation — the DB rejected an overlapping booking. */
const EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly crypto: CryptoService,
    private readonly pricing: PricingService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private readonly logger = new Logger(ReservationsService.name);

  // ---- Availability (deterministic; the AI calls this, never guesses) ----
  async checkAvailability(hotelId: string, dto: AvailabilityDto) {
    const rooms = await this.findAvailableRooms(
      hotelId,
      dto.checkIn,
      dto.checkOut,
      dto.roomTypeId,
    );
    // group by room type with a representative price
    const byType = new Map<
      string,
      { roomTypeId: string; name: string; basePrice: number; available: number }
    >();
    for (const room of rooms) {
      const t = byType.get(room.roomTypeId) ?? {
        roomTypeId: room.roomTypeId,
        name: room.roomType.name,
        basePrice: room.roomType.basePrice,
        available: 0,
      };
      t.available += 1;
      byType.set(room.roomTypeId, t);
    }
    const nights = nightsBetween(dto.checkIn, dto.checkOut);
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { currency: true },
    });
    // Price each available type via the rate calendar; hide blocked types (stop-sell/CTA).
    const available = [];
    for (const t of byType.values()) {
      const q = await this.pricing.quote(hotelId, t.roomTypeId, dto.checkIn, dto.checkOut);
      if (q.blocked) continue;
      available.push({ ...t, totalForStay: q.total });
    }
    return { checkIn: dto.checkIn, checkOut: dto.checkOut, nights, currency: hotel.currency, available };
  }

  async quote(hotelId: string, dto: QuoteDto) {
    const q = await this.pricing.quote(hotelId, dto.roomTypeId, dto.checkIn, dto.checkOut);
    return {
      roomTypeId: dto.roomTypeId,
      nights: q.nights,
      total: q.total,
      currency: q.currency,
      nightly: q.nightly,
      ...(q.blocked ? { blocked: true, reason: q.reason } : {}),
    };
  }

  /** Physical rooms of the (optional) type with no overlapping blocking reservation. */
  private async findAvailableRooms(
    hotelId: string,
    checkIn: Date,
    checkOut: Date,
    roomTypeId?: string,
  ) {
    return this.prisma.room.findMany({
      where: {
        hotelId,
        deletedAt: null,
        ...(roomTypeId ? { roomTypeId } : {}),
        status: { notIn: ['MAINTENANCE', 'OUT_OF_SERVICE'] },
        reservations: {
          none: {
            status: { in: BLOCKING_RESERVATION_STATUSES },
            checkInDate: { lt: checkOut },
            checkOutDate: { gt: checkIn },
          },
        },
      },
      include: { roomType: true },
      orderBy: { roomNumber: 'asc' },
    });
  }

  // ---- Create (assigns a concrete room so the DB constraint guards races) ----
  async create(
    actor: Actor,
    dto: CreateReservationDto,
    opts: { status?: ReservationStatus } = {},
  ) {
    if (dto.checkOut <= dto.checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }
    return this.idempotency.run(
      {
        key: dto.idempotencyKey,
        hotelId: actor.hotelId,
        method: 'POST',
        path: '/reservations',
      },
      () => this.createInner(actor, dto, opts.status ?? ReservationStatus.CONFIRMED),
    );
  }

  private async createInner(
    actor: Actor,
    dto: CreateReservationDto,
    initialStatus: ReservationStatus,
  ) {
    const hotelId = actor.hotelId;
    const roomType = await this.prisma.roomType.findFirst({
      where: { id: dto.roomTypeId, hotelId },
    });
    if (!roomType) throw new NotFoundException('Room type not found');
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { currency: true },
    });

    // Price via the rate calendar / rate plan and enforce stay restrictions.
    const priced = await this.pricing.quote(
      hotelId,
      dto.roomTypeId,
      dto.checkIn,
      dto.checkOut,
      dto.ratePlanId,
    );
    if (priced.blocked) {
      throw new ConflictException({
        error: { code: 'RATE_RESTRICTED', message: priced.reason ?? 'Dates not bookable' },
      });
    }
    const quote = {
      nights: priced.nights,
      total: priced.total,
      currency: priced.currency,
      nightlyRate: Math.round(priced.total / priced.nights),
    };

    // Find or create the guest by phone (scoped to hotel).
    const guest = await this.upsertGuest(hotelId, dto.guest);

    // Candidate rooms — try each until the DB accepts one (handles races).
    const candidates = dto.roomId
      ? await this.prisma.room.findMany({
          where: { id: dto.roomId, hotelId, deletedAt: null },
          include: { roomType: true },
        })
      : await this.findAvailableRooms(
          hotelId,
          dto.checkIn,
          dto.checkOut,
          dto.roomTypeId,
        );

    if (candidates.length === 0) {
      throw new ConflictException({
        error: {
          code: 'NO_AVAILABILITY',
          message: 'No rooms available for the selected dates',
        },
      });
    }

    for (const room of candidates) {
      try {
        const reservation = await this.prisma.$transaction(async (tx) => {
          const created = await tx.reservation.create({
            data: {
              hotelId,
              guestId: guest.id,
              roomId: room.id,
              roomTypeId: dto.roomTypeId,
              checkInDate: dto.checkIn,
              checkOutDate: dto.checkOut,
              status: initialStatus,
              quotedPrice: quote.total,
              currency: hotel.currency,
              ratePlanId: dto.ratePlanId,
              // Unconfirmed holds auto-release after the configured TTL.
              holdExpiresAt:
                initialStatus === ReservationStatus.HELD
                  ? new Date(Date.now() + this.config.get('HOLD_TTL_MINUTES', { infer: true }) * 60_000)
                  : null,
              source: dto.source,
              adults: dto.adults,
              children: dto.children,
              specialRequests: dto.specialRequests,
              createdById: actor.id,
              createdByType: actor.type,
              idempotencyKey: dto.idempotencyKey,
            },
          });

          await tx.reservationStatusHistory.create({
            data: {
              reservationId: created.id,
              toStatus: initialStatus,
              byId: actor.id,
              note: 'created',
            },
          });

          // Open the folio with the room charge.
          await tx.folio.create({
            data: {
              reservationId: created.id,
              currency: hotel.currency,
              totalCharges: quote.total,
              balance: quote.total,
              lineItems: {
                create: {
                  type: LineType.ROOM,
                  description: `${quote.nights} night(s) @ ${room.roomType.name}`,
                  amount: quote.total,
                  quantity: 1,
                  by: actor.id,
                },
              },
            },
          });

          await this.audit.record(
            {
              actor,
              action: 'reservation.create',
              entity: 'Reservation',
              entityId: created.id,
              after: created,
            },
            tx,
          );
          return created;
        });

        await this.events.emit(DomainEvents.ReservationCreated, {
          hotelId,
          reservationId: reservation.id,
          roomId: reservation.roomId,
        });
        return reservation;
      } catch (e) {
        if (this.isExclusionViolation(e)) {
          // Someone grabbed this room first — try the next candidate.
          continue;
        }
        throw e;
      }
    }

    throw new ConflictException({
      error: {
        code: 'NO_AVAILABILITY',
        message: 'Rooms were taken concurrently; please retry',
      },
    });
  }

  private isExclusionViolation(e: unknown): boolean {
    return (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      // P2010 = raw query failure carrying the pg code; P2002-like wraps differ,
      // so also sniff the message for the exclusion constraint name.
      (e.code === 'P2034' ||
        (typeof e.meta?.code === 'string' && e.meta.code === EXCLUSION_VIOLATION) ||
        /reservation_no_overlap|exclusion/i.test(e.message))
    );
  }

  private async upsertGuest(
    hotelId: string,
    g: CreateReservationDto['guest'],
  ) {
    const existing = await this.prisma.guest.findFirst({
      where: { hotelId, phone: g.phone },
    });
    // Encrypt the government ID number at rest (PII, plan.md §14).
    const idNumberEnc = g.idNumber ? this.crypto.encrypt(g.idNumber) : undefined;
    if (existing) {
      return this.prisma.guest.update({
        where: { id: existing.id },
        data: {
          name: g.name,
          email: g.email ?? existing.email,
          whatsappId: g.whatsappId ?? existing.whatsappId,
          idType: g.idType ?? existing.idType,
          idNumber: idNumberEnc ?? existing.idNumber,
          vip: g.vip ?? existing.vip,
        },
      });
    }
    return this.prisma.guest.create({
      data: {
        hotelId,
        name: g.name,
        phone: g.phone,
        email: g.email,
        whatsappId: g.whatsappId,
        idType: g.idType,
        idNumber: idNumberEnc,
        vip: g.vip ?? false,
        notes: g.notes,
      },
    });
  }

  // ---- Read ----
  async get(hotelId: string, id: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, hotelId },
      include: { guest: true, room: true, roomType: true, folio: true },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.guest?.idNumber) {
      reservation.guest.idNumber = this.crypto.decrypt(reservation.guest.idNumber);
    }
    return reservation;
  }

  /** Room rack / tape chart: rooms × dates grid with reservation blocks (§11.1). */
  async rack(hotelId: string, from: Date, to: Date) {
    const rooms = await this.prisma.room.findMany({
      where: { hotelId, deletedAt: null },
      include: { roomType: { select: { id: true, name: true } } },
      orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
    });
    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        roomId: { not: null },
        status: { in: ['HELD', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
        deletedAt: null,
      },
      include: {
        guest: { select: { id: true, name: true, phone: true, email: true } },
        folio: { select: { id: true, totalCharges: true, totalPaid: true, balance: true, currency: true } },
        roomType: { select: { id: true, name: true } },
      },
    });

    const unassigned = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        roomId: null,
        status: { in: ['HELD', 'CONFIRMED'] },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
        deletedAt: null,
      },
      include: {
        guest: { select: { id: true, name: true, phone: true, email: true } },
        folio: { select: { id: true, totalCharges: true, totalPaid: true, balance: true, currency: true } },
        roomType: { select: { id: true, name: true } },
      },
      orderBy: { checkInDate: 'asc' },
    });

    const byRoom = new Map<string, typeof reservations>();
    for (const r of reservations) {
      const arr = byRoom.get(r.roomId!) ?? [];
      arr.push(r);
      byRoom.set(r.roomId!, arr);
    }
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      rooms: rooms.map((room) => ({
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        type: room.roomType.name,
        roomTypeId: room.roomTypeId,
        status: room.status,
        bookings: (byRoom.get(room.id) ?? []).map((r) => ({
          id: r.id,
          guest: r.guest.name,
          phone: r.guest.phone,
          email: r.guest.email,
          checkIn: r.checkInDate.toISOString().slice(0, 10),
          checkOut: r.checkOutDate.toISOString().slice(0, 10),
          status: r.status,
          source: r.source,
          quotedPrice: r.quotedPrice,
          currency: r.currency,
          adults: r.adults,
          folio: r.folio,
          specialRequests: r.specialRequests,
        })),
      })),
      unassigned: unassigned.map((r) => ({
        id: r.id,
        guest: r.guest.name,
        phone: r.guest.phone,
        email: r.guest.email,
        checkIn: r.checkInDate.toISOString().slice(0, 10),
        checkOut: r.checkOutDate.toISOString().slice(0, 10),
        status: r.status,
        source: r.source,
        roomType: r.roomType.name,
        roomTypeId: r.roomTypeId,
        quotedPrice: r.quotedPrice,
        currency: r.currency,
        folio: r.folio,
      })),
    };
  }

  async list(
    hotelId: string,
    filters?: { status?: ReservationStatus; scope?: string; search?: string },
  ) {
    const where: any = { hotelId, deletedAt: null };

    if (filters?.status) {
      where.status = filters.status;
    }

    const now = new Date();

    if (filters?.scope === 'past') {
      where.OR = [
        { status: { in: [ReservationStatus.CHECKED_OUT, ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW] } },
        { checkOutDate: { lt: now } },
      ];
    } else if (filters?.scope === 'active') {
      where.status = ReservationStatus.CHECKED_IN;
    } else if (filters?.scope === 'upcoming') {
      where.status = { in: [ReservationStatus.CONFIRMED, ReservationStatus.HELD] };
      where.checkInDate = { gte: now };
    }

    if (filters?.search) {
      const q = filters.search.trim();
      const searchConditions = [
        { guest: { name: { contains: q, mode: 'insensitive' } } },
        { guest: { phone: { contains: q, mode: 'insensitive' } } },
        { room: { roomNumber: { contains: q, mode: 'insensitive' } } },
        { id: { contains: q, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    return this.prisma.reservation.findMany({
      where,
      include: {
        guest: true,
        room: true,
        roomType: true,
        folio: {
          select: {
            id: true,
            balance: true,
            totalPaid: true,
            totalCharges: true,
            currency: true,
          },
        },
      },
      orderBy: { checkInDate: filters?.scope === 'past' ? 'desc' : 'asc' },
      take: 300,
    });
  }

  // ---- Modify / cancel ----
  async modify(actor: Actor, id: string, dto: ModifyReservationDto) {
    const current = await this.get(actor.hotelId, id);
    if (
      current.status === ReservationStatus.CHECKED_OUT ||
      current.status === ReservationStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot modify a ${current.status} reservation`,
      );
    }
    const checkIn = dto.checkIn ?? current.checkInDate;
    const checkOut = dto.checkOut ?? current.checkOutDate;
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

    const roomTypeId = dto.roomTypeId ?? current.roomTypeId;
    const datesChanged =
      checkIn.getTime() !== current.checkInDate.getTime() ||
      checkOut.getTime() !== current.checkOutDate.getTime() ||
      roomTypeId !== current.roomTypeId;

    let newTotal = current.quotedPrice;
    if (datesChanged) {
      const priced = await this.pricing.quote(
        actor.hotelId,
        roomTypeId,
        checkIn,
        checkOut,
        current.ratePlanId ?? undefined,
      );
      if (priced.blocked) {
        throw new ConflictException({
          error: { code: 'RATE_RESTRICTED', message: priced.reason ?? 'Dates not bookable' },
        });
      }
      newTotal = priced.total;
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const r = await tx.reservation.update({
          where: { id },
          data: {
            checkInDate: checkIn,
            checkOutDate: checkOut,
            roomTypeId,
            roomId: dto.roomId ?? current.roomId,
            adults: dto.adults ?? current.adults,
            children: dto.children ?? current.children,
            specialRequests: dto.specialRequests ?? current.specialRequests,
            quotedPrice: newTotal,
          },
        });

        if (datesChanged && newTotal !== current.quotedPrice) {
          const delta = newTotal - current.quotedPrice;
          const folio = await tx.folio.findFirst({ where: { reservationId: id } });
          if (folio) {
            await tx.folioLineItem.create({
              data: {
                folioId: folio.id,
                type: LineType.ADJUSTMENT,
                description: `Stay modification adjustment (${current.quotedPrice} -> ${newTotal})`,
                amount: delta,
                quantity: 1,
                by: actor.id,
              },
            });
            await tx.folio.update({
              where: { id: folio.id },
              data: {
                totalCharges: folio.totalCharges + delta,
                balance: folio.balance + delta,
              },
            });
          }
        }

        await this.audit.record(
          {
            actor,
            action: 'reservation.modify',
            entity: 'Reservation',
            entityId: id,
            before: current,
            after: r,
          },
          tx,
        );
        return r;
      });
      await this.events.emit(DomainEvents.ReservationModified, {
        hotelId: actor.hotelId,
        reservationId: id,
      });
      return updated;
    } catch (e) {
      if (this.isExclusionViolation(e)) {
        throw new ConflictException({
          error: {
            code: 'NO_AVAILABILITY',
            message: 'The room is not available for the new dates',
          },
        });
      }
      throw e;
    }
  }

  async cancel(actor: Actor, id: string, reason: string) {
    const current = await this.get(actor.hotelId, id);
    if (current.status === ReservationStatus.CHECKED_OUT) {
      throw new BadRequestException('Cannot cancel a checked-out reservation');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id },
        data: { status: ReservationStatus.CANCELLED },
      });
      await tx.reservationStatusHistory.create({
        data: {
          reservationId: id,
          fromStatus: current.status,
          toStatus: ReservationStatus.CANCELLED,
          byId: actor.id,
          note: reason,
        },
      });
      await this.audit.record(
        {
          actor,
          action: 'reservation.cancel',
          entity: 'Reservation',
          entityId: id,
          before: current,
        },
        tx,
      );
    });
    await this.events.emit(DomainEvents.ReservationCancelled, {
      hotelId: actor.hotelId,
      reservationId: id,
      reason,
    });
    return { ok: true };
  }

  /**
   * Auto-release abandoned holds (plan.md §11.1 "holds with expiry"). Every few
   * minutes, any HELD reservation past its holdExpiresAt is cancelled so the
   * blocked rooms become available again for other guests.
   */
  @Cron('0 */3 * * * *')
  async releaseExpiredHolds(): Promise<number> {
    const expired = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.HELD,
        holdExpiresAt: { not: null, lt: new Date() },
      },
      select: { id: true, hotelId: true },
    });
    let released = 0;
    for (const r of expired) {
      try {
        await this.cancel(systemActor(r.hotelId), r.id, 'Hold expired — auto-released');
        await this.prisma.notification.create({
          data: {
            hotelId: r.hotelId,
            role: 'FRONT_DESK',
            type: 'reservation.hold_expired',
            title: 'Hold auto-released',
            body: `Unconfirmed hold ${r.id.slice(0, 8)} expired and was released.`,
            entityRef: r.id,
          },
        });
        released += 1;
      } catch (e) {
        this.logger.warn(`Failed to release expired hold ${r.id}: ${e}`);
      }
    }
    if (released > 0) this.logger.log(`Auto-released ${released} expired hold(s)`);
    return released;
  }

  /**
   * Multi-Property Chain CRS - List Sister Hotels / Properties
   */
  async getChainProperties(currentHotelId: string) {
    const hotels = await this.prisma.hotel.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] as any } },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        currency: true,
        _count: { select: { rooms: { where: { deletedAt: null } } } },
      },
    });

    return hotels.map((h) => ({
      id: h.id,
      name: h.name,
      slug: h.slug,
      address: h.address ?? 'HospitalityOS Cluster',
      phone: h.phone,
      currency: h.currency,
      totalRooms: h._count.rooms,
      isCurrent: h.id === currentHotelId,
    }));
  }

  /**
   * Multi-Property Chain CRS - Real-Time Cross-Property Availability & Rate Search
   */
  async checkChainAvailability(input: {
    currentHotelId: string;
    checkIn: Date;
    checkOut: Date;
    adults?: number;
  }) {
    const hotels = await this.prisma.hotel.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] as any } },
      include: {
        roomTypes: true,
      },
    });

    const results = [];
    for (const h of hotels) {
      const roomTypeAvailability = [];

      for (const rt of h.roomTypes) {
        const totalRooms = await this.prisma.room.count({
          where: { hotelId: h.id, roomTypeId: rt.id, deletedAt: null },
        });

        const bookedRooms = await this.prisma.reservation.count({
          where: {
            hotelId: h.id,
            roomTypeId: rt.id,
            status: { in: BLOCKING_RESERVATION_STATUSES as never },
            checkInDate: { lt: input.checkOut },
            checkOutDate: { gt: input.checkIn },
          },
        });

        const available = Math.max(0, totalRooms - bookedRooms);
        if (available > 0) {
          const priced = await this.pricing.quote(
            h.id,
            rt.id,
            input.checkIn,
            input.checkOut,
          );

          roomTypeAvailability.push({
            roomTypeId: rt.id,
            name: rt.name,
            capacity: rt.capacity,
            availableRooms: available,
            totalQuote: priced.total,
            currency: h.currency,
          });
        }
      }

      results.push({
        hotelId: h.id,
        hotelName: h.name,
        address: h.address ?? 'HospitalityOS Network',
        currency: h.currency,
        isCurrent: h.id === input.currentHotelId,
        availableRoomTypes: roomTypeAvailability,
      });
    }

    return results;
  }

  /**
   * Multi-Property Chain CRS - Book into Sister Property
   */
  async bookSisterProperty(
    actor: Actor,
    input: {
      targetHotelId: string;
      roomTypeId: string;
      checkIn: Date;
      checkOut: Date;
      guest: { name: string; phone: string; email?: string };
      adults?: number;
      specialRequests?: string;
    },
  ) {
    const originHotel = await this.prisma.hotel.findUnique({
      where: { id: actor.hotelId },
      select: { name: true },
    });

    const targetActor: Actor = {
      ...actor,
      hotelId: input.targetHotelId,
    };

    const crossRequest = `[Chain CRS Transfer from ${originHotel?.name ?? 'Sister Property'}] ${
      input.specialRequests ?? ''
    }`.trim();

    return this.create(targetActor, {
      guest: input.guest,
      roomTypeId: input.roomTypeId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: input.adults ?? 1,
      children: 0,
      source: ReservationSource.WALK_IN,
      specialRequests: crossRequest,
    });
  }
}
