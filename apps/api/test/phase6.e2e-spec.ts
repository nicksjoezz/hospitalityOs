/**
 * Phase 6 proofs: loyalty earns on payment, GDPR erase anonymises a guest,
 * public booking creates a HELD request, tables/waitlist work, payroll computes
 * from attendance × rate.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ActorType,
  PaymentMethod,
  PaymentType,
  Role,
  ReservationSource,
} from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentsService } from '../src/payments/payments.service';
import { GdprService } from '../src/gdpr/gdpr.service';
import { TablesService } from '../src/dining/tables.service';
import { WaitlistService } from '../src/dining/waitlist.service';
import { StaffService } from '../src/staff/staff.service';
import { PublicController } from '../src/public/public.controller';
import { Actor } from '../src/common/actor';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Phase 6 CRM/loyalty/GDPR/dining/public (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let gdpr: GdprService;
  let tables: TablesService;
  let waitlist: WaitlistService;
  let staff: StaffService;
  let publicCtl: PublicController;

  let hotelId: string;
  let roomTypeId: string;
  let ownerActor: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);
    gdpr = app.get(GdprService);
    tables = app.get(TablesService);
    waitlist = app.get(WaitlistService);
    staff = app.get(StaffService);
    publicCtl = app.get(PublicController);

    const hotel = await prisma.hotel.create({
      data: { name: 'P6 Hotel', currency: 'NGN', timezone: 'Africa/Lagos' },
    });
    hotelId = hotel.id;
    const owner = await prisma.user.create({
      data: { hotelId, name: 'P6 Owner', role: Role.OWNER, phone: '+2348144000001', passwordHash: 'x' },
    });
    ownerActor = { type: ActorType.USER, hotelId, id: owner.id, role: Role.OWNER };
    const rt = await prisma.roomType.create({
      data: { hotelId, name: 'P6 Std', basePrice: 1_000_000, capacity: 2 },
    });
    roomTypeId = rt.id;
    await prisma.room.create({ data: { hotelId, roomTypeId, roomNumber: 'P6-1' } });
  });

  afterAll(async () => {
    await prisma.loyaltyTransaction.deleteMany({ where: { hotelId } });
    await prisma.waitlist.deleteMany({ where: { hotelId } });
    await prisma.order.deleteMany({ where: { hotelId } });
    await prisma.floorTable.deleteMany({ where: { hotelId } });
    await prisma.attendanceRecord.deleteMany({ where: { hotelId } });
    const userIds = (await prisma.user.findMany({ where: { hotelId }, select: { id: true } })).map((u) => u.id);
    await prisma.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.payment.deleteMany({ where: { hotelId } });
    await prisma.folioLineItem.deleteMany({ where: { folio: { reservation: { hotelId } } } });
    await prisma.folio.deleteMany({ where: { reservation: { hotelId } } });
    await prisma.reservationStatusHistory.deleteMany({ where: { reservation: { hotelId } } });
    await prisma.reservation.deleteMany({ where: { hotelId } });
    await prisma.guest.deleteMany({ where: { hotelId } });
    await prisma.room.deleteMany({ where: { hotelId } });
    await prisma.roomType.deleteMany({ where: { hotelId } });
    await prisma.auditLog.deleteMany({ where: { hotelId } });
    await prisma.outboxEvent.deleteMany({ where: { hotelId } });
    await prisma.idempotencyKey.deleteMany({ where: { hotelId } });
    await prisma.user.deleteMany({ where: { hotelId } });
    await prisma.hotel.deleteMany({ where: { id: hotelId } });
    await app.close();
  });

  it('awards loyalty points + tracks spend on payment', async () => {
    const guest = await prisma.guest.create({
      data: { hotelId, name: 'Loyal Guest', phone: '+2347066660000' },
    });
    const reservation = await prisma.reservation.create({
      data: {
        hotelId, guestId: guest.id, roomTypeId,
        checkInDate: new Date('2036-01-01'), checkOutDate: new Date('2036-01-02'),
        status: 'CHECKED_IN', quotedPrice: 1_000_000, currency: 'NGN',
      },
    });
    await prisma.folio.create({
      data: { reservationId: reservation.id, currency: 'NGN', totalCharges: 1_000_000, balance: 1_000_000 },
    });
    // Pay ₦10,000 (1,000,000 kobo) → 10,000 points at 1 pt/unit.
    await payments.recordPayment(ownerActor, reservation.id, {
      amount: 1_000_000, method: PaymentMethod.CASH, type: PaymentType.FULL,
    });

    // The CRM hook runs on the event loop; poll for it.
    let updated = guest;
    for (let i = 0; i < 20; i++) {
      updated = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
      if (updated.loyaltyPoints > 0) break;
      await wait(100);
    }
    expect(updated.totalSpent).toBe(1_000_000);
    expect(updated.loyaltyPoints).toBe(10_000);
    const txns = await prisma.loyaltyTransaction.count({ where: { guestId: guest.id, type: 'EARN' } });
    expect(txns).toBe(1);
  });

  it('GDPR erase anonymises the guest', async () => {
    const guest = await prisma.guest.create({
      data: { hotelId, name: 'Erase Me', phone: '+2347077770000', email: 'erase@test.io' },
    });
    await gdpr.erase(ownerActor, guest.id);
    const after = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(after.name).toBe('Erased Guest');
    expect(after.email).toBeNull();
    expect(after.optedInMarketing).toBe(false);
    expect(after.anonymizedAt).toBeTruthy();
  });

  it('public booking creates a HELD request and is trackable', async () => {
    const res = (await publicCtl.book({
      hotelId,
      guestName: 'Web Guest',
      guestPhone: '+2347088880000',
      roomTypeId,
      checkIn: '2037-03-01',
      checkOut: '2037-03-03',
    })) as { reservationId: string; status: string };
    expect(res.status).toBe('HELD');
    const tracked = (await publicCtl.track(res.reservationId)) as { status: string };
    expect(tracked.status).toBe('HELD');
  });

  it('tables + waitlist flow', async () => {
    const table = await tables.create(ownerActor, { number: 'T1', capacity: 4 });
    const plan = await tables.floorPlan(hotelId);
    expect(plan.tables.some((t) => t.id === table.id)).toBe(true);

    const entry = await waitlist.add(ownerActor, { guestName: 'Walk-up', partySize: 3 });
    const notified = await waitlist.notify(ownerActor, entry.id);
    expect(notified.status).toBe('NOTIFIED');
    const seated = await waitlist.seat(ownerActor, entry.id);
    expect(seated.status).toBe('SEATED');
  });

  it('computes payroll from attendance × rate', async () => {
    const worker = await prisma.user.create({
      data: { hotelId, name: 'Worker', role: Role.HOUSEKEEPING, phone: '+2348144000099', passwordHash: 'x' },
    });
    await prisma.staffProfile.create({
      data: { userId: worker.id, department: Role.HOUSEKEEPING, hourlyRate: 100000 }, // ₦1,000/h
    });
    const start = new Date('2036-02-01T08:00:00Z');
    const end = new Date('2036-02-01T16:00:00Z'); // 8h
    await prisma.attendanceRecord.create({
      data: { hotelId, userId: worker.id, clockInAt: start, clockOutAt: end, method: 'app' },
    });
    const payroll = await staff.payroll(hotelId, new Date('2036-01-01'), new Date('2036-03-01'));
    const line = payroll.lines.find((l) => l.userId === worker.id);
    expect(line?.hours).toBe(8);
    expect(line?.total).toBe(800000); // 8h × ₦1,000
  });
});
