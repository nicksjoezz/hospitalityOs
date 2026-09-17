import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { PourService } from './pour.service';

const pourSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  orderLineId: z.string().uuid().optional(),
});

@RequireFeature(Feature.BAR_POS)
@Controller('bar')
export class BarController {
  constructor(private readonly pour: PourService) {}

  @Roles(Role.MANAGER, Role.BAR)
  @Post('pours')
  logPour(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(pourSchema)) dto: z.infer<typeof pourSchema>,
  ) {
    return this.pour.logPour(actor, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.BAR, Role.ACCOUNTANT)
  @Get('pours/report')
  report(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 7 * 86400_000);
    const t = to ? new Date(to) : new Date();
    return this.pour.poursReport(user.hotelId, f, t);
  }
}
