/**
 * Phase 2 proofs (plan.md §19, §21):
 *  - Cash reconciliation computes variance against opening float + cash collected.
 *  - Confidential staff reports: visible to managers, blocked for non-managers,
 *    anonymous reports hide the reporter.
 *  - Maintenance report aggregates counts and average resolution time.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ActorType,
  MaintCategory,
  MaintSource,
  MaintStatus,
  PaymentMethod,
  PaymentType,
  ReportCategory,
  Role,
} from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashDrawerService } from '../src/payments/cash-drawer.service';
import { PaymentsService } from '../src/payments/payments.service';
import { StaffReportsService } from '../src/staff-reports/staff-reports.service';
import { MaintenanceService } from '../src/maintenance/maintenance.service';
import { MaintenanceReportService } from '../src/maintenance/maintenance-report.service';
import { Actor } from '../src/common/actor';

describe('Phase 2 payments + accountability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cash: CashDrawerService;
  let payments: PaymentsService;
  let reports: StaffReportsService;
  let maintenance: MaintenanceService;
  let maintReport: MaintenanceReportService;

  let hotelId: string;
  let managerId: string;
  let housekeeperId: string;
  let barId: string;
  let roomId: string;

  const actor = (id: string, role: Role): Actor => ({
    type: ActorType.USER,
    hotelId,
    id,
    role,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    cash = app.get(CashDrawerService);
    payments = app.get(PaymentsService);
    reports = app.get(StaffReportsService);
    maintenance = app.get(MaintenanceService);
    maintReport = app.get(MaintenanceReportService);

    const hotel = await prisma.hotel.create({
      data: { name: 'P2 Hotel', currency: 'NGN', timezone: 'Africa/Lagos' },
    });
    hotelId = hotel.id;
    const mk = (name: string, role: Role, phone: string) =>
      prisma.user.create({
        data: { hotelId, name, role, phone, passwordHash: 'x' },
      });
    managerId = (await mk('Mgr', Role.MANAGER, '+2348111000001')).id;
    housekeeperId = (await mk('Hk', Role.HOUSEKEEPING, '+2348111000002')).id;
    barId = (await mk('Bar', Role.BAR, '+2348111000003')).id;
    const rt = await prisma.roomType.create({
      data: { hotelId, name: 'P2 Std', basePrice: 2000000, capacity: 2 },
    });
    roomId = (
      await prisma.room.create({
        data: { hotelId, roomTypeId: rt.id, roomNumber: 'P2-1' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.staffReportEvent.deleteMany({ where: { report: { hotelId } } });
    await prisma.staffReport.deleteMany({ where: { hotelId } });
    await prisma.maintenanceTicketEvent.deleteMany({ where: { ticket: { hotelId } } });
    await prisma.maintenanceTicket.deleteMany({ where: { hotelId } });
    await prisma.notification.deleteMany({ where: { hotelId } });
    await prisma.payment.deleteMany({ where: { hotelId } });
    await prisma.folioLineItem.deleteMany({ where: { folio: { reservation: { hotelId } } } });
    await prisma.folio.deleteMany({ where: { reservation: { hotelId } } });
    await prisma.reservation.deleteMany({ where: { hotelId } });
    await prisma.loyaltyTransaction.deleteMany({ where: { hotelId } });
    await prisma.guest.deleteMany({ where: { hotelId } });
    await prisma.cashDrawerShift.deleteMany({ where: { hotelId } });
    await prisma.room.deleteMany({ where: { hotelId } });
    await prisma.roomType.deleteMany({ where: { hotelId } });
    await prisma.auditLog.deleteMany({ where: { hotelId } });
    await prisma.outboxEvent.deleteMany({ where: { hotelId } });
    await prisma.idempotencyKey.deleteMany({ where: { hotelId } });
    await prisma.user.deleteMany({ where: { hotelId } });
    await prisma.hotel.deleteMany({ where: { id: hotelId } });
    await app.close();
  });

  it('computes cash-drawer variance at close', async () => {
    const cashier = actor(managerId, Role.MANAGER);
    await cash.open(cashier, 100_000); // opening float ₦1,000.00

    // A reservation + folio to take a cash payment against.
    const guest = await prisma.guest.create({
      data: { hotelId, name: 'Cash Guest', phone: '+2347000000777' },
    });
    const reservation = await prisma.reservation.create({
      data: {
        hotelId,
        guestId: guest.id,
        roomId,
        roomTypeId: (await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).roomTypeId,
        checkInDate: new Date('2034-01-01'),
        checkOutDate: new Date('2034-01-02'),
        status: 'CHECKED_IN',
        quotedPrice: 2000000,
        currency: 'NGN',
      },
    });
    await prisma.folio.create({
      data: {
        reservationId: reservation.id,
        currency: 'NGN',
        totalCharges: 2000000,
        balance: 2000000,
      },
    });

    await payments.recordPayment(cashier, reservation.id, {
      amount: 500_000, // ₦5,000.00 cash
      method: PaymentMethod.CASH,
      type: PaymentType.DEPOSIT,
    });

    // Count ₦6,100.00 — ₦100 more than expected (float 1,000 + collected 5,000).
    const closed = await cash.close(cashier, 610_000);
    expect(closed.expectedTotal).toBe(600_000);
    expect(closed.variance).toBe(10_000); // ₦100 surplus
    expect(closed.status).toBe('CLOSED');
  });

  it('keeps staff reports confidential: managers see them, others cannot', async () => {
    const submitted = await reports.submit(actor(housekeeperId, Role.HOUSEKEEPING), {
      subjectUserId: barId,
      category: ReportCategory.THEFT_SUSPICION,
      title: 'Missing stock',
      description: 'Bottles unaccounted for.',
    });
    expect(submitted.reportId).toBeDefined();

    // Manager can read it.
    const asManager = await reports.list(actor(managerId, Role.MANAGER));
    expect(asManager.some((r) => r.id === submitted.reportId)).toBe(true);

    // The reported subject (BAR) cannot read reports at all.
    await expect(reports.list(actor(barId, Role.BAR))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('hides the reporter on anonymous reports', async () => {
    const anon = await reports.submit(actor(housekeeperId, Role.HOUSEKEEPING), {
      subjectFreeText: 'Night guard',
      category: ReportCategory.POLICY_VIOLATION,
      title: 'Left post',
      description: 'Gate left unattended.',
      anonymous: true,
    });
    const got = await reports.get(actor(managerId, Role.MANAGER), anon.reportId);
    expect(got.anonymous).toBe(true);
    expect(got.reporterId).toBeNull(); // reporter hidden even from managers
  });

  it('aggregates the maintenance report', async () => {
    const hk = actor(housekeeperId, Role.HOUSEKEEPING);
    const t1 = await maintenance.registerIssue(hk, {
      roomId,
      category: MaintCategory.HVAC,
      title: 'AC warm',
      description: 'AC not cooling',
      source: MaintSource.HOUSEKEEPING,
    });
    await maintenance.registerIssue(hk, {
      roomId,
      category: MaintCategory.PLUMBING,
      title: 'Leak',
      description: 'Tap leaking',
      source: MaintSource.HOUSEKEEPING,
    });
    await maintenance.updateStatus(actor(managerId, Role.MANAGER), t1.id, MaintStatus.RESOLVED);

    const report = await maintReport.generate(hotelId, {});
    expect(report.totals.total).toBe(2);
    expect(report.byCategory[MaintCategory.HVAC]).toBe(1);
    expect(report.byCategory[MaintCategory.PLUMBING]).toBe(1);
    expect(report.totals.closed).toBe(1);
    expect(report.avgResolutionHours).not.toBeNull();

    const csv = await maintReport.csv(hotelId, {});
    expect(csv).toContain('Ticket ID');
    expect(csv.split('\n').length).toBeGreaterThan(2);
  });
});
