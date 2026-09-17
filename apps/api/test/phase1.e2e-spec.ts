/**
 * Phase 1 proofs (plan.md §19): the AI tool layer calls deterministic services
 * (it does not hallucinate state), the orchestrator persists conversations and
 * routes senders, and the dashboard snapshot computes real numbers.
 *
 * Runs without an ANTHROPIC_API_KEY: tool execution is tested directly, and the
 * orchestrator falls back to a templated reply while still recording messages.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActorType, Channel, ReservationSource } from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ToolsService } from '../src/ai/tools.service';
import { OrchestratorService } from '../src/ai/orchestrator.service';
import { DashboardService } from '../src/dashboard/dashboard.service';

describe('Phase 1 AI + dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tools: ToolsService;
  let orchestrator: OrchestratorService;
  let dashboard: DashboardService;

  let hotelId: string;
  let roomTypeId: string;
  let guestId: string;
  const ORPHAN_PHONE = '+2347099887766';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    tools = app.get(ToolsService);
    orchestrator = app.get(OrchestratorService);
    dashboard = app.get(DashboardService);

    const hotel = await prisma.hotel.create({
      data: { name: 'P1 Hotel', currency: 'NGN', timezone: 'Africa/Lagos' },
    });
    hotelId = hotel.id;
    const rt = await prisma.roomType.create({
      data: { hotelId, name: 'P1 Standard', basePrice: 3000000, capacity: 2 },
    });
    roomTypeId = rt.id;
    await prisma.room.createMany({
      data: [
        { hotelId, roomTypeId, roomNumber: 'P1-1', status: 'AVAILABLE' },
        { hotelId, roomTypeId, roomNumber: 'P1-2', status: 'OCCUPIED' },
      ],
    });
    const guest = await prisma.guest.create({
      data: { hotelId, name: 'Tool Guest', phone: '+2347012340000' },
    });
    guestId = guest.id;
  });

  afterAll(async () => {
    // Orphan guest/conversation created under the first (seed) hotel by the
    // single-tenant orchestrator fallback test.
    await prisma.message.deleteMany({
      where: { conversation: { externalId: ORPHAN_PHONE } },
    });
    await prisma.conversation.deleteMany({ where: { externalId: ORPHAN_PHONE } });
    await prisma.guest.deleteMany({ where: { phone: ORPHAN_PHONE } });

    await prisma.message.deleteMany({ where: { conversation: { hotelId } } });
    await prisma.conversation.deleteMany({ where: { hotelId } });
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
    await prisma.idempotencyKey.deleteMany({ where: { hotelId } });
    await prisma.hotel.deleteMany({ where: { id: hotelId } });
    await app.close();
  });

  const guestCtx = () => ({
    actor: { type: ActorType.AI, hotelId, id: guestId } as const,
    audience: 'guest' as const,
    guestId,
  });

  it('check_availability tool returns deterministic availability', async () => {
    // Block one of the two rooms with an overlapping CONFIRMED reservation;
    // availability is driven by reservation overlap (plan.md §6.2).
    const room = await prisma.room.findFirstOrThrow({
      where: { hotelId, roomNumber: 'P1-2' },
    });
    await prisma.reservation.create({
      data: {
        hotelId,
        guestId,
        roomId: room.id,
        roomTypeId,
        checkInDate: new Date('2033-01-09'),
        checkOutDate: new Date('2033-01-13'),
        status: 'CONFIRMED',
        quotedPrice: 1,
        currency: 'NGN',
      },
    });

    const res = (await tools.execute(
      'check_availability',
      { checkIn: '2033-01-10', checkOut: '2033-01-12' },
      guestCtx(),
    )) as { available: Array<{ roomTypeId: string; available: number }> };
    const standard = res.available.find((a) => a.roomTypeId === roomTypeId);
    expect(standard?.available).toBe(1); // P1-2 is booked for the window
  });

  it('create_reservation tool actually creates a reservation via the service', async () => {
    const res = (await tools.execute(
      'create_reservation',
      {
        guestName: 'Tool Guest',
        guestPhone: '+2347012340000',
        roomTypeId,
        checkIn: '2033-02-01',
        checkOut: '2033-02-03',
      },
      guestCtx(),
    )) as { reservationId: string; status: string };
    expect(res.status).toBe('CONFIRMED');
    const row = await prisma.reservation.findUnique({ where: { id: res.reservationId } });
    expect(row?.source).toBe(ReservationSource.WHATSAPP);
    expect(row?.createdByType).toBe(ActorType.AI);
  });

  it('rejects a guest calling a staff-only tool', async () => {
    await expect(
      tools.execute('get_dashboard_snapshot', {}, guestCtx()),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('orchestrator persists the conversation and falls back without an API key', async () => {
    // Single-tenant resolveHotelId() routes to the first hotel, so query the
    // auto-created guest/conversation by their stable keys, not the test hotel.
    const reply = await orchestrator.handleInbound({
      channel: Channel.WHATSAPP,
      externalId: ORPHAN_PHONE,
      from: ORPHAN_PHONE,
      text: 'Do you have a room next weekend?',
      senderName: 'Walk-up Wendy',
    });
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);

    const guest = await prisma.guest.findFirst({ where: { phone: ORPHAN_PHONE } });
    expect(guest).toBeTruthy(); // unknown sender auto-created as guest
    const convo = await prisma.conversation.findFirst({
      where: { externalId: ORPHAN_PHONE },
      include: { messages: true },
    });
    expect(convo?.messages.length).toBeGreaterThanOrEqual(2); // inbound + reply
  });

  it('dashboard snapshot computes occupancy and counts', async () => {
    const snap = await dashboard.snapshot(hotelId);
    expect(snap.occupancy.total).toBeGreaterThanOrEqual(2);
    expect(snap.occupancy.occupied).toBeGreaterThanOrEqual(1);
    expect(snap.currency).toBe('NGN');
    expect(Array.isArray(snap.alerts)).toBe(true);
  });
});
