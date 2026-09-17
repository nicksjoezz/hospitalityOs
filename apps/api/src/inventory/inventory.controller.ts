import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, InvCategory, MovementType, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { InventoryService } from './inventory.service';
import { LossService } from './loss.service';

const itemSchema = z.object({
  name: z.string().min(1),
  category: z.nativeEnum(InvCategory),
  unit: z.string().min(1),
  sku: z.string().optional(),
  currentQty: z.number().nonnegative().optional(),
  parLevel: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().optional(),
  costPerUnit: z.number().int().nonnegative().optional(),
  perishable: z.boolean().optional(),
  location: z.string().optional(),
});
const moveSchema = z.object({
  type: z.nativeEnum(MovementType),
  quantity: z.number(),
  reason: z.string().optional(),
});
const countSchema = z.object({
  countedQty: z.number().nonnegative(),
  note: z.string().optional(),
});
const wastageSchema = z.object({
  quantity: z.number().positive(),
  reason: z.string().min(1),
});

const INV_WRITERS = [
  Role.MANAGER,
  Role.PROCUREMENT,
  Role.KITCHEN,
  Role.BAR,
  Role.HOUSEKEEPING,
];

@RequireFeature(Feature.INVENTORY)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly loss: LossService,
  ) {}

  @Roles(Role.MANAGER, Role.PROCUREMENT)
  @Post('items')
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(itemSchema)) dto: z.infer<typeof itemSchema>,
  ) {
    return this.inventory.createItem(actor, dto);
  }

  @Get('items')
  list(@CurrentUser() user: AuthUser, @Query('category') category?: InvCategory) {
    return this.inventory.list(user.hotelId, category);
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser) {
    return this.inventory.lowStock(user.hotelId);
  }

  @Get('loss-alerts')
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  lossAlerts(@CurrentUser() user: AuthUser) {
    return this.loss.getAlerts(user.hotelId);
  }

  @Get('waste-report')
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT, Role.KITCHEN, Role.BAR)
  wasteReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    return this.inventory.wasteReport(user.hotelId, f, t);
  }

  @Get('waste-insights')
  @Roles(Role.OWNER, Role.MANAGER)
  wasteInsights(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    return this.inventory.wasteInsights(user.hotelId, f, t);
  }

  @Get('items/:id/forecast')
  forecast(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.inventory.forecast(user.hotelId, id);
  }

  @Roles(...INV_WRITERS)
  @Post('items/:id/movements')
  move(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveSchema)) dto: z.infer<typeof moveSchema>,
  ) {
    return this.inventory.move(actor, { itemId: id, ...dto });
  }

  @Roles(...INV_WRITERS)
  @Post('items/:id/wastage')
  wastage(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(wastageSchema)) dto: z.infer<typeof wastageSchema>,
  ) {
    return this.inventory.logWastage(actor, id, dto.quantity, dto.reason);
  }

  @Roles(Role.MANAGER, Role.PROCUREMENT, Role.KITCHEN, Role.BAR)
  @Post('items/:id/count')
  count(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(countSchema)) dto: z.infer<typeof countSchema>,
  ) {
    return this.inventory.recordCount(actor, id, dto.countedQty, dto.note);
  }
}
