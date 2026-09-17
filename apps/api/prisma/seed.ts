/**
 * Demo seed (plan.md §20). Idempotent-ish: wipes and recreates a single demo
 * hotel with rooms, staff across all roles, guests, reservations (past +
 * upcoming), folios/payments, housekeeping + maintenance tickets, inventory
 * (incl. alcohol for variance demos), suppliers, and one confidential staff report.
 *
 * Dev login: every user's password is `password123`.
 */
import 'dotenv/config';
import {
  PrismaClient,
  Role,
  RoomStatus,
  ReservationStatus,
  ReservationSource,
  LineType,
  PaymentMethod,
  PaymentType,
  HkTaskType,
  HkStatus,
  Priority,
  MaintCategory,
  MaintStatus,
  MaintSource,
  InvCategory,
  Outlet,
  POStatus,
  ReportCategory,
  Severity,
  ReportStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const CURRENCY = process.env.DEFAULT_CURRENCY ?? 'NGN';
const PASSWORD = 'password123';

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function wipe(): Promise<void> {
  // Order matters due to FKs. Only the demo set; fine for a dev DB.
  await prisma.$transaction([
    prisma.staffReportEvent.deleteMany(),
    prisma.staffReport.deleteMany(),
    prisma.maintenanceTicketEvent.deleteMany(),
    prisma.maintenanceTicket.deleteMany(),
    prisma.housekeepingTask.deleteMany(),
    // restaurant / bar / inventory / procurement
    prisma.pourLog.deleteMany(),
    prisma.orderLine.deleteMany(),
    prisma.order.deleteMany(),
    prisma.floorTable.deleteMany(),
    prisma.waitlist.deleteMany(),
    prisma.loyaltyTransaction.deleteMany(),
    prisma.recipeIngredient.deleteMany(),
    prisma.menuItem.deleteMany(),
    prisma.recipe.deleteMany(),
    prisma.menuCategory.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.quotation.deleteMany(),
    prisma.stockCount.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.supplier.deleteMany(),
    // messaging / notifications
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.notification.deleteMany(),
    // staff / security
    prisma.attendanceRecord.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.staffProfile.deleteMany(),
    prisma.securityIncident.deleteMany(),
    prisma.visitorLog.deleteMany(),
    prisma.shiftHandover.deleteMany(),
    prisma.cashDrawerShift.deleteMany(),
    // payments / reservations
    prisma.folioLineItem.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.folio.deleteMany(),
    prisma.reservationStatusHistory.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.guest.deleteMany(),
    prisma.area.deleteMany(),
    prisma.room.deleteMany(),
    prisma.roomType.deleteMany(),
    prisma.session.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.outboxEvent.deleteMany(),
    prisma.idempotencyKey.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hotel.deleteMany(),
  ]);
}

async function main(): Promise<void> {
  await wipe();
  const passwordHash = await argon2.hash(PASSWORD);

  const hotel = await prisma.hotel.create({
    data: {
      name: 'Demo Grand Hotel',
      timezone: 'Africa/Lagos',
      currency: CURRENCY,
      address: '1 Marina Road, Lagos',
      phone: '+2348000000000',
    },
  });

  // ---- Users across every role ----
  const roleUsers: Array<{ name: string; role: Role; phone: string }> = [
    { name: 'Olu Owner', role: Role.OWNER, phone: '+2348100000001' },
    { name: 'Mary Manager', role: Role.MANAGER, phone: '+2348100000002' },
    { name: 'Funke FrontDesk', role: Role.FRONT_DESK, phone: '+2348100000003' },
    { name: 'Hadiza Housekeeping', role: Role.HOUSEKEEPING, phone: '+2348100000004' },
    { name: 'Musa Maintenance', role: Role.MAINTENANCE, phone: '+2348100000005' },
    { name: 'Kemi Kitchen', role: Role.KITCHEN, phone: '+2348100000006' },
    { name: 'Bola Bar', role: Role.BAR, phone: '+2348100000007' },
    { name: 'Paul Procurement', role: Role.PROCUREMENT, phone: '+2348100000008' },
    { name: 'Sani Security', role: Role.SECURITY, phone: '+2348100000009' },
    { name: 'Aisha Accountant', role: Role.ACCOUNTANT, phone: '+2348100000010' },
  ];
  const users: Record<string, { id: string }> = {};
  for (const u of roleUsers) {
    const created = await prisma.user.create({
      data: {
        hotelId: hotel.id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        email: `${u.role.toLowerCase()}@demo.test`,
        passwordHash,
      },
    });
    users[u.role] = created;
  }

  // ---- Room types & rooms (~20) ----
  const standard = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: 'Standard', basePrice: 2500000, capacity: 2, description: 'Standard double' },
  });
  const deluxe = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: 'Deluxe', basePrice: 4500000, capacity: 3, description: 'Deluxe with view' },
  });
  const suite = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: 'Suite', basePrice: 8000000, capacity: 4, description: 'Executive suite' },
  });

  const rooms: { id: string; roomNumber: string }[] = [];
  const layout: Array<{ type: string; count: number; floorBase: number }> = [
    { type: standard.id, count: 10, floorBase: 1 },
    { type: deluxe.id, count: 7, floorBase: 2 },
    { type: suite.id, count: 3, floorBase: 3 },
  ];
  let n = 0;
  for (const block of layout) {
    for (let i = 0; i < block.count; i++) {
      n++;
      const roomNumber = `${block.floorBase}${String(i + 1).padStart(2, '0')}`;
      // sprinkle a couple of non-available statuses for demo
      const status =
        n === 5 ? RoomStatus.DIRTY : n === 12 ? RoomStatus.MAINTENANCE : RoomStatus.AVAILABLE;
      const room = await prisma.room.create({
        data: {
          hotelId: hotel.id,
          roomTypeId: block.type,
          roomNumber,
          floor: String(block.floorBase),
          status,
        },
      });
      rooms.push({ id: room.id, roomNumber });
    }
  }

  // ---- Areas (non-room) ----
  await prisma.area.createMany({
    data: [
      { hotelId: hotel.id, name: 'Main Lobby', type: 'LOBBY' },
      { hotelId: hotel.id, name: 'Kitchen', type: 'KITCHEN' },
      { hotelId: hotel.id, name: 'Generator House', type: 'GENERATOR' },
    ],
  });

  // ---- Guests ----
  const guestA = await prisma.guest.create({
    data: { hotelId: hotel.id, name: 'John Traveller', phone: '+2347011111111', vip: false },
  });
  const guestB = await prisma.guest.create({
    data: { hotelId: hotel.id, name: 'Grace VIP', phone: '+2347022222222', vip: true },
  });
  const guestC = await prisma.guest.create({
    data: { hotelId: hotel.id, name: 'Foreign Frank', phone: '+14155550000', email: 'frank@abroad.test' },
  });

  // ---- Reservations ----
  // 1) Past, checked out (room already cleaned/available)
  const pastRoom = rooms[0];
  const pastRes = await prisma.reservation.create({
    data: {
      hotelId: hotel.id, guestId: guestA.id, roomId: pastRoom.id, roomTypeId: standard.id,
      checkInDate: daysFromNow(-5), checkOutDate: daysFromNow(-2),
      status: ReservationStatus.CHECKED_OUT, quotedPrice: 7500000, currency: CURRENCY,
      source: ReservationSource.WALK_IN, adults: 2,
    },
  });
  await prisma.folio.create({
    data: {
      reservationId: pastRes.id, currency: CURRENCY, totalCharges: 7500000, totalPaid: 7500000, balance: 0,
      lineItems: { create: { type: LineType.ROOM, description: '3 nights @ Standard', amount: 2500000, quantity: 3 } },
    },
  });
  await prisma.payment.create({
    data: {
      hotelId: hotel.id, reservationId: pastRes.id, amount: 7500000, currency: CURRENCY, baseAmount: 7500000,
      method: PaymentMethod.CASH, type: PaymentType.FULL, recordedById: users[Role.FRONT_DESK].id,
    },
  });

  // 2) Currently checked in (room occupied)
  const stayRoom = rooms[1];
  const stayRes = await prisma.reservation.create({
    data: {
      hotelId: hotel.id, guestId: guestB.id, roomId: stayRoom.id, roomTypeId: standard.id,
      checkInDate: daysFromNow(-1), checkOutDate: daysFromNow(2),
      status: ReservationStatus.CHECKED_IN, quotedPrice: 7500000, currency: CURRENCY,
      source: ReservationSource.WHATSAPP, adults: 1,
    },
  });
  await prisma.room.update({ where: { id: stayRoom.id }, data: { status: RoomStatus.OCCUPIED } });
  await prisma.folio.create({
    data: {
      reservationId: stayRes.id, currency: CURRENCY, totalCharges: 7500000, totalPaid: 3000000, balance: 4500000,
      lineItems: { create: { type: LineType.ROOM, description: '3 nights @ Standard', amount: 2500000, quantity: 3 } },
    },
  });
  await prisma.payment.create({
    data: {
      hotelId: hotel.id, reservationId: stayRes.id, amount: 3000000, currency: CURRENCY, baseAmount: 3000000,
      method: PaymentMethod.TRANSFER, type: PaymentType.DEPOSIT, recordedById: users[Role.FRONT_DESK].id,
    },
  });

  // 3) Upcoming confirmed (deluxe), demonstrates foreign guest
  const futureRoom = rooms[10];
  const futureRes = await prisma.reservation.create({
    data: {
      hotelId: hotel.id, guestId: guestC.id, roomId: futureRoom.id, roomTypeId: deluxe.id,
      checkInDate: daysFromNow(3), checkOutDate: daysFromNow(6),
      status: ReservationStatus.CONFIRMED, quotedPrice: 13500000, currency: CURRENCY,
      source: ReservationSource.WEBSITE, adults: 2,
    },
  });
  await prisma.folio.create({
    data: {
      reservationId: futureRes.id, currency: CURRENCY, totalCharges: 13500000, totalPaid: 0, balance: 13500000,
      lineItems: { create: { type: LineType.ROOM, description: '3 nights @ Deluxe', amount: 4500000, quantity: 3 } },
    },
  });

  // ---- Housekeeping task (dirty room) ----
  await prisma.housekeepingTask.create({
    data: {
      hotelId: hotel.id, roomId: rooms[4].id, type: HkTaskType.CHECKOUT_CLEAN,
      status: HkStatus.PENDING, priority: Priority.HIGH, note: 'Seed dirty room',
    },
  });

  // ---- Maintenance tickets (incl. one housekeeping-registered) ----
  await prisma.maintenanceTicket.create({
    data: {
      hotelId: hotel.id, roomId: rooms[11].id, category: MaintCategory.HVAC, priority: Priority.HIGH,
      status: MaintStatus.OPEN, title: 'AC not cooling', description: 'Guest room AC blows warm air.',
      reportedById: users[Role.HOUSEKEEPING].id, reporterRole: Role.HOUSEKEEPING, source: MaintSource.HOUSEKEEPING,
      takesRoomOutOfService: true,
    },
  });
  await prisma.maintenanceTicket.create({
    data: {
      hotelId: hotel.id, category: MaintCategory.GENERATOR_POWER, priority: Priority.URGENT,
      status: MaintStatus.ASSIGNED, title: 'Generator overheating', description: 'Generator trips after 2h.',
      reportedById: users[Role.SECURITY].id, reporterRole: Role.SECURITY, source: MaintSource.STAFF,
      assignedToId: users[Role.MAINTENANCE].id,
    },
  });

  // ---- Inventory (incl. alcohol for variance demo) ----
  const beer = await prisma.inventoryItem.create({
    data: { hotelId: hotel.id, name: 'Star Lager (bottle)', category: InvCategory.BEVERAGE_ALCOHOL, unit: 'bottle', currentQty: 120, parLevel: 200, reorderPoint: 80, costPerUnit: 60000, perishable: false },
  });
  const flour = await prisma.inventoryItem.create({
    data: { hotelId: hotel.id, name: 'Flour', category: InvCategory.FOOD, unit: 'kg', currentQty: 50, parLevel: 60, reorderPoint: 20, costPerUnit: 80000, perishable: false },
  });
  await prisma.inventoryItem.createMany({
    data: [
      { hotelId: hotel.id, name: 'Bath Soap', category: InvCategory.TOILETRIES, unit: 'piece', currentQty: 300, parLevel: 200, reorderPoint: 100, costPerUnit: 15000 },
      { hotelId: hotel.id, name: 'Bed Sheets', category: InvCategory.LINEN, unit: 'set', currentQty: 60, parLevel: 80, reorderPoint: 40, costPerUnit: 350000 },
      { hotelId: hotel.id, name: 'AC Filter', category: InvCategory.MAINTENANCE_PARTS, unit: 'piece', currentQty: 8, parLevel: 20, reorderPoint: 10, costPerUnit: 120000 },
    ],
  });

  // ---- Stock count showing a beverage loss (theoretical 120 vs counted 100 = ~17%) ----
  await prisma.stockCount.create({
    data: { hotelId: hotel.id, itemId: beer.id, expectedQty: 120, countedQty: 100, variance: 20, countedById: users[Role.BAR].id, note: 'Evening count' },
  });

  // ---- Menu + recipe (selling a dish depletes flour) ----
  const kitchenCat = await prisma.menuCategory.create({
    data: { hotelId: hotel.id, name: 'Mains', outlet: Outlet.RESTAURANT },
  });
  const breadRecipe = await prisma.recipe.create({
    data: {
      hotelId: hotel.id, name: 'Bread basket', yieldQty: 1, yieldUnit: 'serving',
      ingredients: { create: { inventoryItemId: flour.id, quantity: 0.5, unit: 'kg' } },
    },
  });
  await prisma.menuItem.create({
    data: { hotelId: hotel.id, categoryId: kitchenCat.id, name: 'Jollof Rice & Chicken', price: 650000, recipeId: breadRecipe.id },
  });

  // ---- Suppliers ----
  const bevSupplier = await prisma.supplier.create({
    data: { hotelId: hotel.id, name: 'Lagos Beverages Ltd', phone: '+2348030000001', categories: ['BEVERAGE_ALCOHOL', 'BEVERAGE_SOFT'] },
  });
  await prisma.supplier.create({
    data: { hotelId: hotel.id, name: 'CleanCo Supplies', phone: '+2348030000002', categories: ['TOILETRIES', 'CLEANING', 'LINEN'] },
  });

  // ---- A draft purchase order awaiting approval ----
  await prisma.purchaseOrder.create({
    data: {
      hotelId: hotel.id, supplierId: bevSupplier.id,
      items: [{ inventoryItemId: beer.id, name: 'Star Lager (bottle)', quantity: 100, unitCost: 60000 }],
      total: 6000000, status: POStatus.PENDING_APPROVAL,
      draftedById: users[Role.PROCUREMENT].id, note: 'Restock beer',
    },
  });

  // ---- One confidential staff report (manager/owner visible only) ----
  await prisma.staffReport.create({
    data: {
      hotelId: hotel.id, reporterId: users[Role.HOUSEKEEPING].id, reporterRole: Role.HOUSEKEEPING,
      subjectUserId: users[Role.BAR].id, category: ReportCategory.THEFT_SUSPICION, severity: Severity.HIGH,
      title: 'Possible bar shortage', description: 'Noticed bottles unaccounted for after evening shift.',
      status: ReportStatus.SUBMITTED, confidential: true, visibleToRoles: [Role.OWNER, Role.MANAGER], anonymous: false,
    },
  });

  console.log(`Seeded hotel "${hotel.name}" (${CURRENCY}) with ${rooms.length} rooms, ${roleUsers.length} users.`);
  console.log(`Login with phone ${roleUsers[0].phone} / password ${PASSWORD} (OWNER).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
