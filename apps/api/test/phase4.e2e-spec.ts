/**
 * Phase 4 proofs (plan.md §11.12–§11.14):
 *  - Revenue analytics computes occupancy/ADR/RevPAR deterministically.
 *  - Price suggestions flow suggest → approve → apply (updates the base price).
 *  - Marketing campaigns resolve a segment and record cost-aware metrics on send.
 *  - The AI GM answers from a deterministic cross-department context.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActorType, Role, SuggestionStatus } from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RevenueService } from '../src/revenue/revenue.service';
import { MarketingService } from '../src/marketing/marketing.service';
import { GmService } from '../src/ai/gm.service';
import { Actor } from '../src/common/actor';

const DAY = 86_400_000;

describe('Phase 4 revenue + marketing + GM (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let revenue: RevenueService;
  let marketing: MarketingService;
  let gm: GmService;

  let hotelId: string;
  let roomTypeId: string;
  let actor: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    revenue = app.get(RevenueService);
    marketing = app.get(MarketingService);
    gm = app.get(GmService);

    const hotel = await prisma.hotel.create({
      data: { name: 'P4 Hotel', currency: 'NGN', timezone: 'Africa/Lagos' },
    });
    hotelId = hotel.id;
    const mgr = await prisma.user.create({
      data: { hotelId, name: 'Mgr4', role: Role.OWNER, phone: '+2348133000001', passwordHash: 'x' },
    });
    actor = { type: ActorType.USER, hotelId, id: mgr.id, role: Role.OWNER };
    const rt = await prisma.roomType.create({
      data: { hotelId, name: 'P4 Std', basePrice: 1_000_000, capacity: 2 },
    });
    roomTypeId = rt.id;
    await prisma.room.createMany({
      data: [
        { hotelId, roomTypeId, roomNumber: 'P4-1' },
        { hotelId, roomTypeId, roomNumber: 'P4-2' },
      ],
    });
    const guest = await prisma.guest.create({
      data: { hotelId, name: 'Past Guest', phone: '+2347044440000' },
    });
    // A 3-night stay 5..2 days ago at ₦10,000/night (quoted 3,000,000).
    await prisma.reservation.create({
      data: {
        hotelId,
        guestId: guest.id,
        roomTypeId,
        checkInDate: new Date(Date.now() - 5 * DAY),
        checkOutDate: new Date(Date.now() - 2 * DAY),
        status: 'CHECKED_OUT',
        quotedPrice: 3_000_000,
        currency: 'NGN',
      },
    });
  });

  afterAll(async () => {
    await prisma.priceSuggestion.deleteMany({ where: { hotelId } });
    await prisma.campaign.deleteMany({ where: { hotelId } });
    await prisma.notification.deleteMany({ where: { hotelId } });
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

  it('computes occupancy / ADR / RevPAR', async () => {
    const a = await revenue.analytics(
      hotelId,
      new Date(Date.now() - 10 * DAY),
      new Date(),
    );
    expect(a.soldRoomNights).toBe(3);
    expect(a.adr).toBe(1_000_000); // 3,000,000 over 3 nights
    expect(a.occupancyPct).toBeGreaterThan(0);
    expect(a.revpar).toBeGreaterThan(0);
  });

  it('runs the price-suggestion lifecycle: generate → approve → apply', async () => {
    const gen = await revenue.generateSuggestions(actor, 5);
    expect(gen.generated).toBeGreaterThan(0);

    const suggestions = await revenue.listSuggestions(hotelId, SuggestionStatus.SUGGESTED);
    expect(suggestions.length).toBe(gen.generated);
    const pick = suggestions[0];

    await revenue.decide(actor, pick.id, 'approve');
    const applied = await revenue.apply(actor, pick.id);
    expect(applied.status).toBe(SuggestionStatus.APPLIED);

    // Applying writes the suggested price into the rate calendar.
    const dr = await prisma.dailyRate.findFirst({
      where: { hotelId, roomTypeId, price: pick.suggestedPrice },
    });
    expect(dr).toBeTruthy();
  });

  it('sends a segment-aware campaign and records cost-aware metrics', async () => {
    await prisma.guest.create({
      data: { hotelId, name: 'VIP Vicky', phone: '+2347055550000', vip: true },
    });
    const campaign = await marketing.createCampaign(actor, {
      name: 'Weekend deal',
      channel: 'WHATSAPP',
      segment: { vip: true },
      body: 'Enjoy 20% off this weekend!',
    });
    await marketing.approve(actor, campaign.id);
    const sent = await marketing.send(actor, campaign.id);
    const metrics = sent.metrics as { recipients: number; queued: number; estimatedCost: number };
    expect(sent.status).toBe('SENT');
    expect(metrics.recipients).toBeGreaterThanOrEqual(1);
    expect(metrics.queued).toBeGreaterThanOrEqual(1);
    expect(metrics.estimatedCost).toBe(metrics.recipients * 2000);
  });

  it('AI GM answers from a deterministic cross-department context', async () => {
    const res = await gm.ask(hotelId, 'How is the hotel doing this month?');
    expect(typeof res.answer).toBe('string');
    expect(res.context).toContain('REVENUE');
    expect(res.context).toContain('LOSS');
  });
});
