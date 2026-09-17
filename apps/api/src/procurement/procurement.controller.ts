import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, POStatus, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { ProcurementService } from './procurement.service';

const supplierSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().email().optional(),
  categories: z.array(z.string()).optional(),
});
const poItem = z.object({
  inventoryItemId: z.string().uuid().optional(),
  name: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().int().nonnegative(),
});
const poSchema = z.object({
  supplierId: z.string().uuid(),
  items: z.array(poItem).min(1),
  note: z.string().optional(),
});

@RequireFeature(Feature.PROCUREMENT)
@Roles(Role.OWNER, Role.MANAGER, Role.PROCUREMENT)
@Controller('procurement')
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  @Post('suppliers')
  createSupplier(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(supplierSchema)) dto: z.infer<typeof supplierSchema>,
  ) {
    return this.procurement.createSupplier(actor, dto);
  }

  @Get('suppliers')
  listSuppliers(@CurrentUser() user: AuthUser) {
    return this.procurement.listSuppliers(user.hotelId);
  }

  @Post('quotations')
  recordQuotation(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(z.object({ supplierId: z.string().uuid(), items: z.array(poItem).min(1) })))
    dto: { supplierId: string; items: z.infer<typeof poItem>[] },
  ) {
    return this.procurement.recordQuotation(actor, dto);
  }

  @Get('quotations')
  listQuotations(@CurrentUser() user: AuthUser, @Query('supplierId') supplierId?: string) {
    return this.procurement.listQuotations(user.hotelId, supplierId);
  }

  @Get('quotations/compare')
  compare(@CurrentUser() user: AuthUser) {
    return this.procurement.compareQuotations(user.hotelId);
  }

  @Post('suppliers/:id/draft-message')
  draftMessage(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('brief') brief: string,
  ) {
    return this.procurement.draftSupplierMessage(actor, id, brief ?? 'We would like to place an order.');
  }

  @Post('purchase-orders')
  draft(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(poSchema)) dto: z.infer<typeof poSchema>,
  ) {
    return this.procurement.draftPO(actor, dto);
  }

  @Post('purchase-orders/draft-from-low-stock')
  draftFromLowStock(
    @CurrentActor() actor: Actor,
    @Body('supplierId') supplierId: string,
  ) {
    return this.procurement.draftFromLowStock(actor, supplierId);
  }

  @Get('purchase-orders')
  listPOs(@CurrentUser() user: AuthUser, @Query('status') status?: POStatus) {
    return this.procurement.listPOs(user.hotelId, status);
  }

  @Post('purchase-orders/:id/submit')
  submit(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.procurement.submitForApproval(actor, id);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('purchase-orders/:id/approve')
  approve(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.procurement.approve(actor, id);
  }

  @Post('purchase-orders/:id/send')
  send(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.procurement.send(actor, id);
  }

  @Post('purchase-orders/:id/receive')
  receive(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('partial') partial?: boolean,
  ) {
    return this.procurement.receive(actor, id, partial ?? false);
  }
}
