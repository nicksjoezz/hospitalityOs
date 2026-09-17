import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Role, ShiftStatus } from '@hospitalityos/shared';
import { money } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { CashDrawerService } from './cash-drawer.service';

const openSchema = z.object({ openingFloat: money });
const closeSchema = z.object({ countedCash: money });

@Roles(Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
@Controller('cash-drawer')
export class CashDrawerController {
  constructor(private readonly cashDrawer: CashDrawerService) {}

  @Post('open')
  open(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(openSchema)) dto: z.infer<typeof openSchema>,
  ) {
    return this.cashDrawer.open(actor, dto.openingFloat);
  }

  @Get('current')
  current(@CurrentActor() actor: Actor) {
    return this.cashDrawer.current(actor);
  }

  @Post('close')
  close(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(closeSchema)) dto: z.infer<typeof closeSchema>,
  ) {
    return this.cashDrawer.close(actor, dto.countedCash);
  }

  @Roles(Role.MANAGER, Role.ACCOUNTANT)
  @Post(':id/reconcile')
  reconcile(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.cashDrawer.reconcile(actor, id);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: ShiftStatus) {
    return this.cashDrawer.list(user.hotelId, status);
  }
}
