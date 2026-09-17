/**
 * Phase 7 proofs: bar is separated from the kitchen (per-line station routing),
 * rooms can be taken out of service, and staff accounts can be created/managed.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActorType, Outlet, Role, RoomStatus } from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MenuService } from '../src/restaurant/menu.service';
import { OrdersService } from '../src/restaurant/orders.service';
import { RoomsService } from '../src/rooms/rooms.service';
import { UsersService } from '../src/users/users.service';
import { Actor } from '../src/common/actor';

describe('Phase 7 bar/kitchen split, rooms OOO, users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let menu: MenuService;
  let orders: OrdersService;
  let rooms: RoomsService;
  let users: UsersService;

  let hotelId: string;
  let actor: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    menu = app.get(MenuService);
    orders = app.get(OrdersService);
    rooms = app.get(RoomsService);
    users = app.get(UsersService);

    const hotel = await prisma.hotel.create({ data: { name: 'P7 Hotel', currency: 'NGN', timezone: 'Africa/Lagos' } });
    hotelId = hotel.id;
    const owner = await prisma.user.create({
      data: { hotelId, name: 'P7 Owner', role: Role.OWNER, phone: '+2348155000001', passwordHash: 'x' },
    });
    actor = { type: ActorType.USER, hotelId, id: owner.id, role: Role.OWNER };
  });

  afterAll(async () => {
    await prisma.orderLine.deleteMany({ where: { order: { hotelId } } });
    await prisma.order.deleteMany({ where: { hotelId } });
    await prisma.menuItem.deleteMany({ where: { hotelId } });
    await prisma.menuCategory.deleteMany({ where: { hotelId } });
    await prisma.room.deleteMany({ where: { hotelId } });
    await prisma.roomType.deleteMany({ where: { hotelId } });
    await prisma.auditLog.deleteMany({ where: { hotelId } });
    await prisma.outboxEvent.deleteMany({ where: { hotelId } });
    await prisma.notification.deleteMany({ where: { hotelId } });
    await prisma.session.deleteMany({ where: { user: { hotelId } } });
    await prisma.user.deleteMany({ where: { hotelId } });
    await prisma.hotel.deleteMany({ where: { id: hotelId } });
    await app.close();
  });

  it('routes food to the kitchen and drinks to the bar (separate stations)', async () => {
    const foodCat = await menu.createCategory(actor, { name: 'Mains', outlet: Outlet.RESTAURANT });
    const barCat = await menu.createCategory(actor, { name: 'Drinks', outlet: Outlet.BAR });
    const burger = await menu.createItem(actor, { categoryId: foodCat.id, name: 'Burger', price: 500000 });
    const beer = await menu.createItem(actor, { categoryId: barCat.id, name: 'Beer', price: 150000 });

    // One order containing both a food line and a drink line.
    await orders.create(actor, {
      outlet: Outlet.RESTAURANT,
      lines: [{ menuItemId: burger.id, quantity: 1 }, { menuItemId: beer.id, quantity: 2 }],
    });

    const kitchen = await orders.activeTickets(hotelId, 'kitchen');
    const bar = await orders.activeTickets(hotelId, 'bar');

    const kitchenLines = kitchen.flatMap((t) => t.lines.map((l) => l.name));
    const barLines = bar.flatMap((t) => t.lines.map((l) => l.name));
    expect(kitchenLines).toContain('Burger');
    expect(kitchenLines).not.toContain('Beer'); // bar item must NOT show on the kitchen
    expect(barLines).toContain('Beer');
    expect(barLines).not.toContain('Burger'); // food must NOT show on the bar
  });

  it('takes a room out of service and blocks it while occupied', async () => {
    const rt = await prisma.roomType.create({ data: { hotelId, name: 'P7 Std', basePrice: 1_000_000, capacity: 2 } });
    const room = await prisma.room.create({ data: { hotelId, roomTypeId: rt.id, roomNumber: 'P7-1' } });

    const ooo = await rooms.setStatus(actor, room.id, RoomStatus.OUT_OF_SERVICE, 'Burst pipe');
    expect(ooo.status).toBe('OUT_OF_SERVICE');

    // Occupied rooms cannot be taken out of service.
    await prisma.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
    await expect(rooms.setStatus(actor, room.id, RoomStatus.MAINTENANCE)).rejects.toMatchObject({ status: 400 });
  });

  it('creates a staff account and guards the last owner', async () => {
    const created = await users.create(actor, {
      name: 'New Clerk', phone: '+2348155009999', role: Role.FRONT_DESK, password: 'secret123',
    });
    expect(created.role).toBe(Role.FRONT_DESK);
    const list = await users.list(hotelId);
    expect(list.some((u) => u.id === created.id)).toBe(true);
    // The sole owner cannot be deactivated.
    await expect(users.deactivate(actor, actor.id!)).rejects.toMatchObject({ status: 400 });
  });
});
