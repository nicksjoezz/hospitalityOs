/**
 * Phase 3 proofs (plan.md §19, §21):
 *  - Selling a dish depletes recipe ingredients (theoretical usage).
 *  - Loss/shrinkage detection flags a count variance beyond the threshold.
 *  - Receiving a purchase order posts PURCHASE_IN stock.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ActorType,
  InvCategory,
  Outlet,
  Role,
} from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { LossService } from '../src/inventory/loss.service';
import { MenuService } from '../src/restaurant/menu.service';
import { OrdersService } from '../src/restaurant/orders.service';
import { ProcurementService } from '../src/procurement/procurement.service';
import { Actor } from '../src/common/actor';

describe('Phase 3 inventory + POS + procurement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inventory: InventoryService;
  let loss: LossService;
  let menu: MenuService;
  let orders: OrdersService;
  let procurement: ProcurementService;

  let hotelId: string;
  let actor: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    inventory = app.get(InventoryService);
    loss = app.get(LossService);
    menu = app.get(MenuService);
    orders = app.get(OrdersService);
    procurement = app.get(ProcurementService);

    const hotel = await prisma.hotel.create({
      data: { name: 'P3 Hotel', currency: 'NGN', timezone: 'Africa/Lagos' },
    });
    hotelId = hotel.id;
    const mgr = await prisma.user.create({
      data: { hotelId, name: 'Mgr3', role: Role.MANAGER, phone: '+2348122000001', passwordHash: 'x' },
    });
    actor = { type: ActorType.USER, hotelId, id: mgr.id, role: Role.MANAGER };
  });

  afterAll(async () => {
    await prisma.orderLine.deleteMany({ where: { order: { hotelId } } });
    await prisma.order.deleteMany({ where: { hotelId } });
    await prisma.pourLog.deleteMany({ where: { hotelId } });
    await prisma.stockMovement.deleteMany({ where: { hotelId } });
    await prisma.stockCount.deleteMany({ where: { hotelId } });
    await prisma.recipeIngredient.deleteMany({ where: { recipe: { hotelId } } });
    await prisma.menuItem.deleteMany({ where: { hotelId } });
    await prisma.recipe.deleteMany({ where: { hotelId } });
    await prisma.menuCategory.deleteMany({ where: { hotelId } });
    await prisma.purchaseOrder.deleteMany({ where: { hotelId } });
    await prisma.quotation.deleteMany({ where: { hotelId } });
    await prisma.supplier.deleteMany({ where: { hotelId } });
    await prisma.inventoryItem.deleteMany({ where: { hotelId } });
    await prisma.notification.deleteMany({ where: { hotelId } });
    await prisma.auditLog.deleteMany({ where: { hotelId } });
    await prisma.outboxEvent.deleteMany({ where: { hotelId } });
    await prisma.user.deleteMany({ where: { hotelId } });
    await prisma.hotel.deleteMany({ where: { id: hotelId } });
    await app.close();
  });

  it('depletes recipe ingredients when an order is sent to kitchen', async () => {
    const flour = await inventory.createItem(actor, {
      name: 'Flour',
      category: InvCategory.FOOD,
      unit: 'kg',
      currentQty: 100,
      reorderPoint: 5,
    });
    const recipe = await menu.createRecipe(actor, {
      name: 'Bread',
      ingredients: [{ inventoryItemId: flour.id, quantity: 1, unit: 'kg' }],
    });
    const category = await menu.createCategory(actor, { name: 'Bakery', outlet: Outlet.RESTAURANT });
    const item = await menu.createItem(actor, {
      categoryId: category.id,
      name: 'Loaf',
      price: 100000,
      recipeId: recipe.id,
    });

    const order = await orders.create(actor, {
      outlet: Outlet.RESTAURANT,
      lines: [{ menuItemId: item.id, quantity: 2 }],
    });
    expect(order.total).toBe(200000);
    await orders.sendToKitchen(actor, order.id);

    const after = await inventory.get(hotelId, flour.id);
    expect(Number(after.currentQty)).toBe(98); // 100 - (1 * 2)
  });

  it('flags a loss when a physical count is below expected', async () => {
    const beer = await inventory.createItem(actor, {
      name: 'Star Lager',
      category: InvCategory.BEVERAGE_ALCOHOL,
      unit: 'bottle',
      currentQty: 200,
      reorderPoint: 50,
    });
    // Count 180 vs expected 200 → 10% variance (> 5% alcohol threshold).
    const count = await inventory.recordCount(actor, beer.id, 180);
    expect(count.variance).toBe(20);

    const alerts = await loss.getAlerts(hotelId);
    const beerAlert = alerts.find((a) => a.itemId === beer.id);
    expect(beerAlert).toBeTruthy();
    expect(beerAlert?.variancePct).toBeGreaterThanOrEqual(5);
    expect(beerAlert?.probableCause).toContain('overpour');

    // The count corrected the book quantity to the physical count.
    const corrected = await inventory.get(hotelId, beer.id);
    expect(Number(corrected.currentQty)).toBe(180);
  });

  it('receives a purchase order and posts PURCHASE_IN stock', async () => {
    const soap = await inventory.createItem(actor, {
      name: 'Soap',
      category: InvCategory.TOILETRIES,
      unit: 'piece',
      currentQty: 10,
      reorderPoint: 5,
    });
    const supplier = await procurement.createSupplier(actor, {
      name: 'CleanCo',
      phone: '+2348030000099',
    });
    const po = await procurement.draftPO(actor, {
      supplierId: supplier.id,
      items: [{ inventoryItemId: soap.id, name: 'Soap', quantity: 5, unitCost: 15000 }],
    });
    expect(po.total).toBe(75000);
    await procurement.approve(actor, po.id);
    await procurement.send(actor, po.id);
    const received = await procurement.receive(actor, po.id);
    expect(received.status).toBe('RECEIVED');

    const after = await inventory.get(hotelId, soap.id);
    expect(Number(after.currentQty)).toBe(15); // 10 + 5
  });
});
