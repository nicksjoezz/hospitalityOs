import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { GuestsService } from './guests.service';

const profileSchema = z.object({
  vip: z.boolean().optional(),
  birthday: z.string().regex(/^\d{2}-\d{2}$/).optional(),
  allergies: z.string().optional(),
  preferences: z.string().optional(),
  optedInMarketing: z.boolean().optional(),
  notes: z.string().optional(),
});

@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('vip') vip?: string,
  ) {
    return this.guests.list(user.hotelId, { search, vip: vip === 'true' });
  }

  @Get('segments')
  segments(@CurrentUser() user: AuthUser) {
    return this.guests.segments(user.hotelId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.guests.get(user.hotelId, id);
  }

  @Get(':id/loyalty')
  ledger(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.guests.ledger(user.hotelId, id);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Patch(':id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(profileSchema)) dto: z.infer<typeof profileSchema>,
  ) {
    return this.guests.updateProfile(actor, id, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post(':id/loyalty/adjust')
  adjust(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('points') points: number,
    @Body('note') note?: string,
  ) {
    return this.guests.adjustPoints(actor, id, points, note);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post(':id/loyalty/redeem')
  redeem(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('points') points: number,
  ) {
    return this.guests.redeemPoints(actor, id, points);
  }
}
