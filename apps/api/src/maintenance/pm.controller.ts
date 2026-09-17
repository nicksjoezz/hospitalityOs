import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  AssetStatus,
  isoDate,
  MaintCategory,
  Priority,
  Role,
  ScheduleFrequency,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { PmService } from './pm.service';

const scheduleSchema = z.object({
  title: z.string().min(1),
  category: z.nativeEnum(MaintCategory).optional(),
  roomId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  frequency: z.nativeEnum(ScheduleFrequency),
  priority: z.nativeEnum(Priority).optional(),
  startAt: isoDate.optional(),
});
const assetSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  location: z.string().optional(),
  serial: z.string().optional(),
  purchaseDate: isoDate.optional(),
  warrantyUntil: isoDate.optional(),
});

@Roles(Role.OWNER, Role.MANAGER, Role.MAINTENANCE)
@Controller('maintenance')
export class PmController {
  constructor(private readonly pm: PmService) {}

  @Post('schedules')
  createSchedule(@CurrentActor() actor: Actor, @Body(new ZodValidationPipe(scheduleSchema)) dto: z.infer<typeof scheduleSchema>) {
    return this.pm.createSchedule(actor, dto);
  }
  @Get('schedules')
  listSchedules(@CurrentUser() user: AuthUser) {
    return this.pm.listSchedules(user.hotelId);
  }
  @Patch('schedules/:id/active')
  setActive(@CurrentActor() actor: Actor, @Param('id') id: string, @Body('active') active: boolean) {
    return this.pm.setActive(actor, id, active);
  }

  @Post('assets')
  createAsset(@CurrentActor() actor: Actor, @Body(new ZodValidationPipe(assetSchema)) dto: z.infer<typeof assetSchema>) {
    return this.pm.createAsset(actor, dto);
  }
  @Get('assets')
  listAssets(@CurrentUser() user: AuthUser) {
    return this.pm.listAssets(user.hotelId);
  }
  @Patch('assets/:id/status')
  setAssetStatus(@CurrentActor() actor: Actor, @Param('id') id: string, @Body('status') status: AssetStatus) {
    return this.pm.setAssetStatus(actor, id, status);
  }
}
