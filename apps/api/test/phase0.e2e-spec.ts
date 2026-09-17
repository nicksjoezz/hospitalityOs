/**
 * Phase 0 acceptance proofs (plan.md §19, §21), run against a real DB.
 *  1. Double-booking is impossible (DB exclusion constraint + service check).
 *  2. Idempotent create: replaying the same queued write has one effect.
 *  3. Checkout auto-creates a housekeeping cleaning task (event chain).
 *
 * Requires DATABASE_URL pointing at a migrated database.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActorType, ReservationSource } from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { FrontDeskService } from '../src/front-desk/front-desk.service';
import { Actor } from '../src/common/actor';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Phase 0 reservation spine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reservations: ReservationsService;
  let frontDesk: FrontDeskService;

  let hotelId: string;
  let roomTypeId: string;
  let actor: Actor;

  const ci = new Date('2030-02-10T12:00:00.000Z');
  const co = new Date('2030-02-12T12:00:00.000Z');

  const guest = { name: 'E2E Guest', phone: '+2347099999001' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    reservations = app.get(ReservationsService);
    frontDesk = app.get(FrontDeskService);

    const hotel = await prisma.hotel.create({
      data: { name: 'E2E Test Hotel', currency: 'NGN', timezone: 'Africa/Lagos' },
    });
    hotelId = hotel.id;
    actor = { type: ActorType.USER, hotelId, id: undefined };

    const rt = await prisma.roomType.create({
      data: { hotelId, name: 'E2E Standard', basePrice: 2000000, capacity: 2 },
    });
    roomTypeId = rt.id;

    // EXACTLY ONE room of this type, so the 2nd overlapping booking must fail.
    await prisma.room.create({
      data: { hotelId, roomTypeId, roomNumber: 'E2E-1', status: 'AVAILABLE' },
    });
  });

  afterAll(async () => {
    // Clean up everything we created for this hotel.
    await prisma.folioLineItem.deleteMany({ where: { folio: { reservation: { hotelId } } } });
    await prisma.payment.deleteMany({ where: { hotelId } });
    await prisma.folio.deleteMany({ where: { reservation: { hotelId } } });
    await prisma.reservationStatusHistory.deleteMany({ where: { reservation: { hotelId } } });
    await prisma.housekeepingTask.deleteMany({ where: { hotelId } });
    await prisma.reservation.deleteMany({ where: { hotelId } });
    await prisma.loyaltyTransaction.deleteMany({ where: { hotelId } });
    await prisma.guest.deleteMany({ where: { hotelId } });
    await prisma.room.deleteMany({ where: { hotelId } });
    await prisma.roomType.deleteMany({ where: { hotelId } });
    await prisma.auditLog.deleteMany({ where: { hotelId } });
    await prisma.outboxEvent.deleteMany({ where: { hotelId } });
    await prisma.idempotencyKey.deleteMany({ where: { hotelId } });
    await prisma.hotel.deleteMany({ where: { id: hotelId } });
    await app.close();
  });

  it('creates a reservation and refuses to double-book the only room', async () => {
    const first = await reservations.create(actor, {
      guest,
      roomTypeId,
      checkIn: ci,
      checkOut: co,
      adults: 1,
      children: 0,
      source: ReservationSource.WALK_IN,
    });
    expect(first.id).toBeDefined();
    expect(first.roomId).toBeTruthy();

    // Overlapping dates, same single room type -> no availability.
    await expect(
      reservations.create(actor, {
        guest: { name: 'Second Guest', phone: '+2347099999002' },
        roomTypeId,
        checkIn: new Date('2030-02-11T12:00:00.000Z'),
        checkOut: new Date('2030-02-13T12:00:00.000Z'),
        adults: 1,
        children: 0,
        source: ReservationSource.WALK_IN,
      }),
    ).rejects.toMatchObject({ status: 409 });

    // Exactly one reservation exists for the room.
    const count = await prisma.reservation.count({
      where: { hotelId, roomId: first.roomId },
    });
    expect(count).toBe(1);
  });

  it('enforces the DB exclusion constraint directly (no app check)', async () => {
    const room = await prisma.room.findFirstOrThrow({ where: { hotelId } });
    const g = await prisma.guest.findFirstOrThrow({ where: { hotelId } });
    // Inserting a second blocking reservation straight into the DB must fail.
    await expect(
      prisma.reservation.create({
        data: {
          hotelId,
          guestId: g.id,
          roomId: room.id,
          roomTypeId,
          checkInDate: ci,
          checkOutDate: co,
          status: 'CONFIRMED',
          quotedPrice: 1,
          currency: 'NGN',
        },
      }),
    ).rejects.toBeDefined();
  });

  it('is idempotent: replaying a create with the same key yields one reservation', async () => {
    const key = 'e2e-idem-key-abc123';
    const dto = {
      guest: { name: 'Idem Guest', phone: '+2347099999003' },
      roomTypeId,
      checkIn: new Date('2030-03-01T12:00:00.000Z'),
      checkOut: new Date('2030-03-03T12:00:00.000Z'),
      adults: 1,
      children: 0,
      source: ReservationSource.WHATSAPP,
      idempotencyKey: key,
    };
    const a = await reservations.create(actor, dto);
    const b = await reservations.create(actor, dto);
    expect(b.id).toBe(a.id);
    const count = await prisma.reservation.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it('auto-creates a housekeeping task on checkout (event chain)', async () => {
    const res = await reservations.create(actor, {
      guest: { name: 'Stay Guest', phone: '+2347099999004' },
      roomTypeId,
      checkIn: new Date('2030-04-01T12:00:00.000Z'),
      checkOut: new Date('2030-04-02T12:00:00.000Z'),
      adults: 1,
      children: 0,
      source: ReservationSource.WALK_IN,
    });
    await frontDesk.checkIn(actor, res.id, {});
    const out = await frontDesk.checkOut(actor, res.id);
    expect(out.status).toBe('CHECKED_OUT');

    // The @OnEvent handler runs async; poll briefly.
    let task = null as unknown;
    for (let i = 0; i < 20 && !task; i++) {
      task = await prisma.housekeepingTask.findFirst({
        where: { hotelId, roomId: res.roomId!, type: 'CHECKOUT_CLEAN' },
      });
      if (!task) await wait(100);
    }
    expect(task).toBeTruthy();

    // Room left DIRTY for housekeeping.
    const room = await prisma.room.findUniqueOrThrow({ where: { id: res.roomId! } });
    expect(room.status).toBe('DIRTY');
  });
});
