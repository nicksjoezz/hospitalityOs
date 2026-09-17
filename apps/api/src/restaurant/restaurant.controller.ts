import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, Outlet, OrderStatus, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { MenuService } from './menu.service';
import { OrdersService } from './orders.service';
import { EscposService } from './escpos.service';

const categorySchema = z.object({ name: z.string().min(1), outlet: z.nativeEnum(Outlet) });
const itemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  price: z.number().int().nonnegative(),
  recipeId: z.string().uuid().optional(),
});
const recipeSchema = z.object({
  name: z.string().min(1),
  yieldQty: z.number().positive().optional(),
  yieldUnit: z.string().optional(),
  ingredients: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid(),
        quantity: z.number().positive(),
        unit: z.string().min(1),
      }),
    )
    .min(1),
});
const orderSchema = z.object({
  outlet: z.nativeEnum(Outlet).optional(),
  tableNo: z.string().optional(),
  roomId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  note: z.string().optional(),
  lines: z
    .array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().positive() }))
    .min(1),
});

@RequireFeature(Feature.RESTAURANT_POS)
@Controller('restaurant')
export class RestaurantController {
  constructor(
    private readonly menu: MenuService,
    private readonly orders: OrdersService,
    private readonly escpos: EscposService,
  ) {}

  // ---- Menu / recipes ----
  @Roles(Role.MANAGER, Role.KITCHEN)
  @Post('categories')
  createCategory(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(categorySchema)) dto: z.infer<typeof categorySchema>,
  ) {
    return this.menu.createCategory(actor, dto);
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AuthUser, @Query('outlet') outlet?: Outlet) {
    return this.menu.listCategories(user.hotelId, outlet);
  }

  @Roles(Role.MANAGER, Role.KITCHEN)
  @Post('items')
  createItem(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(itemSchema)) dto: z.infer<typeof itemSchema>,
  ) {
    return this.menu.createItem(actor, dto);
  }

  @Get('items')
  listItems(@CurrentUser() user: AuthUser) {
    return this.menu.listItems(user.hotelId);
  }

  @Roles(Role.MANAGER, Role.KITCHEN)
  @Post('recipes')
  createRecipe(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(recipeSchema)) dto: z.infer<typeof recipeSchema>,
  ) {
    return this.menu.createRecipe(actor, dto);
  }

  // ---- Orders ----
  @Roles(Role.MANAGER, Role.FRONT_DESK, Role.KITCHEN, Role.BAR)
  @Post('orders')
  createOrder(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(orderSchema)) dto: z.infer<typeof orderSchema>,
  ) {
    return this.orders.create(actor, { ...dto, outlet: dto.outlet ?? Outlet.RESTAURANT });
  }

  @Get('orders')
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query('outlet') outlet?: Outlet,
    @Query('status') status?: OrderStatus,
  ) {
    return this.orders.list(user.hotelId, outlet, status);
  }

  @Roles(Role.MANAGER, Role.KITCHEN, Role.BAR)
  @Post('orders/:id/send')
  send(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.orders.sendToKitchen(actor, id);
  }

  /** Active tickets for a prep station: 'kitchen' (food) or 'bar' (drinks). */
  @Roles(Role.MANAGER, Role.KITCHEN, Role.BAR, Role.FRONT_DESK)
  @Get('stations/:station/active')
  stationTickets(
    @CurrentUser() user: AuthUser,
    @Param('station') station: 'kitchen' | 'bar',
  ) {
    return this.orders.activeTickets(user.hotelId, station === 'bar' ? 'bar' : 'kitchen');
  }

  /** KDS status transition (PREPARING / SERVED). */
  @Roles(Role.MANAGER, Role.KITCHEN, Role.BAR)
  @Post('orders/:id/status')
  setStatus(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
  ) {
    return this.orders.setStatus(actor, id, status);
  }

  @Roles(Role.MANAGER, Role.KITCHEN, Role.BAR)
  @Post('orders/:id/lines/:lineId/void')
  voidLine(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body('reason') reason: string,
  ) {
    return this.orders.voidLine(actor, id, lineId, reason ?? 'voided');
  }

  @Roles(Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
  @Post('orders/:id/pay')
  pay(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.orders.pay(actor, id);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.KITCHEN, Role.ACCOUNTANT)
  @Get('analytics')
  analytics(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    return this.orders.analytics(user.hotelId, f, t);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.KITCHEN, Role.ACCOUNTANT)
  @Get('food-cost')
  foodCost(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 7 * 86400_000);
    const t = to ? new Date(to) : new Date();
    return this.orders.foodCost(user.hotelId, f, t);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.KITCHEN, Role.BAR, Role.ACCOUNTANT)
  @Get('orders/:id/escpos')
  getEscpos(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('type') type?: 'receipt' | 'kot',
  ) {
    return this.escpos.generateOrderReceipt(user.hotelId, id, type === 'kot' ? 'kot' : 'receipt');
  }
}
