/**
 * Phase 8 proofs: rate calendar + restrictions, promo discount, tax invoice,
 * night audit (no-show + business-date roll), channel ingest dedupe, demand
 * forecast, and preventive-maintenance scheduling.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ActorType, ChannelType, PromoType, Role, ScheduleFrequency, TaxKind,
} from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RatesService } from '../src/rates/rates.service';
import { PricingService } from '../src/rates/pricing.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { PromotionsService } from '../src/promotions/promotions.service';
import { BillingService } from '../src/billing/billing.service';
import { NightAuditService } from '../src/night-audit/night-audit.service';
import { ChannelManagerService } from '../src/channel-manager/channel-manager.service';
import { RevenueService } from '../src/revenue/revenue.service';
import { PmService } from '../src/maintenance/pm.service';
import { Actor } from '../src/common/actor';

const D = (s: string) => new Date(s);

describe('Phase 8 distribution/rates/billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rates: RatesService;
  let pricing: PricingService;
  let reservations: ReservationsService;
  let promos: PromotionsService;
  let billing: BillingService;
  let nightAudit: NightAuditService;
  let channels: ChannelManagerService;
  let revenue: RevenueService;
  let pm: PmService;

  let hotelId: string;
  let roomTypeId: string;
  let roomId: string;
  let actor: Actor;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    rates = app.get(RatesService);
    pricing = app.get(PricingService);
    reservations = app.get(ReservationsService);
    promos = app.get(PromotionsService);
    billing = app.get(BillingService);
    nightAudit = app.get(NightAuditService);
    channels = app.get(ChannelManagerService);
    revenue = app.get(RevenueService);
    pm = app.get(PmService);

    const hotel = await prisma.hotel.create({ data: { name: 'P8 Hotel', currency: 'NGN', timezone: 'Africa/Lagos' } });
    hotelId = hotel.id;
    const owner = await prisma.user.create({ data: { hotelId, name: 'P8 Owner', role: Role.OWNER, phone: '+2348166000001', passwordHash: 'x' } });
    actor = { type: ActorType.USER, hotelId, id: owner.id, role: Role.OWNER };
    const rt = await prisma.roomType.create({ data: { hotelId, name: 'P8 Std', basePrice: 1_000_000, capacity: 2 } });
    roomTypeId = rt.id;
    roomId = (await prisma.room.create({ data: { hotelId, roomTypeId, roomNumber: 'P8-1' } })).id;
  });

  afterAll(async () => {
    await prisma.dailyRate.deleteMany({ where: { hotelId } });
    await prisma.ratePlan.deleteMany({ where: { hotelId } });
    await prisma.promoCode.deleteMany({ where: { hotelId } });
    await prisma.giftCard.deleteMany({ where: { hotelId } });
    await prisma.invoice.deleteMany({ where: { hotelId } });
    await prisma.taxRate.deleteMany({ where: { hotelId } });
    await prisma.companyAccount.deleteMany({ where: { hotelId } });
    await prisma.channelReservation.deleteMany({ where: { hotelId } });
    await prisma.channelConnection.deleteMany({ where: { hotelId } });
    await prisma.maintenanceTicketEvent.deleteMany({ where: { ticket: { hotelId } } });
    await prisma.maintenanceTicket.deleteMany({ where: { hotelId } });
    await prisma.maintenanceSchedule.deleteMany({ where: { hotelId } });
    await prisma.asset.deleteMany({ where: { hotelId } });
    await prisma.nightAuditRun.deleteMany({ where: { hotelId } });
    await prisma.priceSuggestion.deleteMany({ where: { hotelId } });
    await prisma.notification.deleteMany({ where: { hotelId } });
    await prisma.payment.deleteMany({ where: { hotelId } });
    await prisma.folioLineItem.deleteMany({ where: { folio: { reservation: { hotelId } } } });
    await prisma.folio.deleteMany({ where: { reservation: { hotelId } } });
    await prisma.reservationStatusHistory.deleteMany({ where: { reservation: { hotelId } } });
    await prisma.reservation.deleteMany({ where: { hotelId } });
    await prisma.loyaltyTransaction.deleteMany({ where: { hotelId } });
    await prisma.guest.deleteMany({ where: { hotelId } });
    await prisma.room.deleteMany({ where: { hotelId } });
    await prisma.roomType.deleteMany({ where: { hotelId } });
    await prisma.auditLog.deleteMany({ where: { hotelId } });
    await prisma.outboxEvent.deleteMany({ where: { hotelId } });
    await prisma.user.deleteMany({ where: { hotelId } });
    await prisma.hotel.deleteMany({ where: { id: hotelId } });
    await app.close();
  });

  it('prices from the rate calendar and enforces restrictions', async () => {
    await rates.setCalendar(actor, { roomTypeId, from: D('2041-01-10'), to: D('2041-01-12'), price: 2_000_000, minStay: 2 });
    const oneNight = await pricing.quote(hotelId, roomTypeId, D('2041-01-10'), D('2041-01-11'));
    expect(oneNight.blocked).toBe(true); // min-stay 2
    const twoNight = await pricing.quote(hotelId, roomTypeId, D('2041-01-10'), D('2041-01-12'));
    expect(twoNight.blocked).toBe(false);
    expect(twoNight.total).toBe(4_000_000); // 2 × ₦20,000 from calendar

    await rates.setCalendar(actor, { roomTypeId, from: D('2041-03-05'), to: D('2041-03-05'), stopSell: true });
    const stop = await pricing.quote(hotelId, roomTypeId, D('2041-03-05'), D('2041-03-06'));
    expect(stop.blocked).toBe(true);
  });

  it('applies a promo discount to a folio', async () => {
    const res = await reservations.create(actor, {
      guest: { name: 'Promo Guest', phone: '+2347099000001' }, roomTypeId,
      checkIn: D('2041-01-10'), checkOut: D('2041-01-12'), adults: 1, children: 0, source: 'WALK_IN',
    });
    await promos.createPromo(actor, { code: 'SAVE10', type: PromoType.PERCENT, value: 10 });
    const applied = await promos.applyPromo(actor, res.id, 'SAVE10');
    expect(applied.discount).toBe(400_000); // 10% of 4,000,000
    expect(applied.balance).toBe(3_600_000);
  });

  it('generates a tax invoice', async () => {
    await billing.createTax(actor, { name: 'VAT', kind: TaxKind.VAT, percentBps: 750 });
    const res = await reservations.create(actor, {
      guest: { name: 'Invoice Guest', phone: '+2347099000002' }, roomTypeId,
      checkIn: D('2041-02-01'), checkOut: D('2041-02-02'), adults: 1, children: 0, source: 'WALK_IN',
    });
    const inv = await billing.generateFromReservation(actor, res.id);
    expect(inv.subtotal).toBe(1_000_000); // base price (no calendar override on 2041-02-01)
    expect(inv.taxTotal).toBe(75_000); // 7.5%
    expect(inv.total).toBe(1_075_000);
  });

  it('night audit marks no-shows and rolls the business date', async () => {
    const guest = await prisma.guest.create({ data: { hotelId, name: 'No Show', phone: '+2347099000003' } });
    const noShow = await prisma.reservation.create({
      data: {
        hotelId, guestId: guest.id, roomTypeId,
        checkInDate: new Date(Date.now() - 86_400_000), checkOutDate: new Date(Date.now() + 86_400_000),
        status: 'CONFIRMED', quotedPrice: 1, currency: 'NGN',
      },
    });
    const result = await nightAudit.run(actor);
    expect(result.summary.noShows).toBeGreaterThanOrEqual(1);
    const after = await prisma.reservation.findUniqueOrThrow({ where: { id: noShow.id } });
    expect(after.status).toBe('NO_SHOW');
    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    expect(hotel.businessDate).toBeTruthy();
  });

  it('ingests OTA reservations idempotently', async () => {
    const payload = {
      externalId: 'BCOM-123', guestName: 'OTA Guest', guestPhone: '+2347099000004',
      roomTypeId, checkIn: '2041-05-10', checkOut: '2041-05-12',
    };
    const first = await channels.ingestReservation(hotelId, ChannelType.BOOKING_COM, payload);
    const second = await channels.ingestReservation(hotelId, ChannelType.BOOKING_COM, payload);
    expect(second.deduped).toBe(true);
    expect(second.reservationId).toBe(first.reservationId);
  });

  it('produces a demand forecast', async () => {
    const f = await revenue.forecast(hotelId, 7);
    expect(f.days).toHaveLength(7);
    expect(f.totalRooms).toBeGreaterThanOrEqual(1);
  });

  it('auto-releases an abandoned hold so the room frees up', async () => {
    const held = await reservations.create(
      actor,
      {
        guest: { name: 'Abandoned Hold', phone: '+2347099000009' }, roomTypeId,
        checkIn: D('2042-06-10'), checkOut: D('2042-06-12'), adults: 1, children: 0, source: 'WEBSITE',
      },
      { status: 'HELD' as never },
    );
    expect(held.status).toBe('HELD');
    expect(held.holdExpiresAt).toBeTruthy();

    // Simulate the TTL elapsing with no confirmation.
    await prisma.reservation.update({ where: { id: held.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const released = await reservations.releaseExpiredHolds();
    expect(released).toBeGreaterThanOrEqual(1);

    const after = await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } });
    expect(after.status).toBe('CANCELLED');

    // The room is bookable again for the same dates.
    const rebook = await reservations.create(actor, {
      guest: { name: 'Next Guest', phone: '+2347099000010' }, roomTypeId,
      checkIn: D('2042-06-10'), checkOut: D('2042-06-12'), adults: 1, children: 0, source: 'WALK_IN',
    });
    expect(rebook.status).toBe('CONFIRMED');
  });

  it('spawns a ticket from a due preventive-maintenance schedule', async () => {
    await pm.createSchedule(actor, { title: 'AC filter clean', frequency: ScheduleFrequency.DAILY, startAt: new Date(Date.now() - 1000) });
    const before = await prisma.maintenanceTicket.count({ where: { hotelId, source: 'PREVENTIVE' } });
    await pm.runDue();
    const afterCount = await prisma.maintenanceTicket.count({ where: { hotelId, source: 'PREVENTIVE' } });
    expect(afterCount).toBeGreaterThan(before);
  });
});
