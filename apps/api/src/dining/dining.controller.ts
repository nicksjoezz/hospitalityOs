import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { isoDate, Role, TableStatus, WaitlistStatus } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { TablesService } from './tables.service';
import { WaitlistService } from './waitlist.service';

const tableSchema = z.object({
  number: z.string().min(1),
  capacity: z.number().int().positive(),
  location: z.string().optional(),
  notes: z.string().optional(),
});
const tableUpdateSchema = z.object({
  status: z.nativeEnum(TableStatus).optional(),
  capacity: z.number().int().positive().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});
const waitlistSchema = z.object({
  guestName: z.string().min(1),
  phone: z.string().optional(),
  partySize: z.number().int().positive().optional(),
  requestedTime: isoDate.optional(),
  notes: z.string().optional(),
});

const STAFF = [Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.KITCHEN, Role.BAR];

@Controller('dining')
export class DiningController {
  constructor(
    private readonly tables: TablesService,
    private readonly waitlist: WaitlistService,
  ) {}

  // ---- Tables ----
  @Roles(Role.OWNER, Role.MANAGER)
  @Post('tables')
  createTable(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(tableSchema)) dto: z.infer<typeof tableSchema>,
  ) {
    return this.tables.create(actor, dto);
  }

  @Get('tables')
  listTables(@CurrentUser() user: AuthUser) {
    return this.tables.list(user.hotelId);
  }

  @Get('floor-plan')
  floorPlan(@CurrentUser() user: AuthUser) {
    return this.tables.floorPlan(user.hotelId);
  }

  @Roles(...STAFF)
  @Patch('tables/:id')
  updateTable(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tableUpdateSchema)) dto: z.infer<typeof tableUpdateSchema>,
  ) {
    return this.tables.update(actor, id, dto);
  }

  @Roles(...STAFF)
  @Post('tables/:id/assign-order')
  assignOrder(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('orderId') orderId: string,
  ) {
    return this.tables.assignOrder(actor, id, orderId);
  }

  // ---- Waitlist ----
  @Roles(...STAFF)
  @Post('waitlist')
  addWaitlist(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(waitlistSchema)) dto: z.infer<typeof waitlistSchema>,
  ) {
    return this.waitlist.add(actor, dto);
  }

  @Get('waitlist')
  listWaitlist(@CurrentUser() user: AuthUser, @Query('status') status?: WaitlistStatus) {
    return this.waitlist.list(user.hotelId, status);
  }

  @Roles(...STAFF)
  @Post('waitlist/:id/notify')
  notify(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.waitlist.notify(actor, id);
  }

  @Roles(...STAFF)
  @Post('waitlist/:id/seat')
  seat(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.waitlist.seat(actor, id);
  }

  @Roles(...STAFF)
  @Post('waitlist/:id/cancel')
  cancel(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.waitlist.cancel(actor, id);
  }
}
