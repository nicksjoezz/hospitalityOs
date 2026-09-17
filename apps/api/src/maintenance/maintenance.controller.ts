import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  MaintCategory,
  MaintSource,
  MaintStatus,
  Priority,
  Role,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { MaintenanceService } from './maintenance.service';

const registerSchema = z.object({
  roomId: z.string().uuid().optional(),
  areaId: z.string().uuid().optional(),
  category: z.nativeEnum(MaintCategory),
  priority: z.nativeEnum(Priority).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  photoUrls: z.array(z.string()).optional(),
  takesRoomOutOfService: z.boolean().optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(MaintStatus),
  note: z.string().optional(),
});

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Roles(
    Role.MANAGER,
    Role.MAINTENANCE,
    Role.HOUSEKEEPING,
    Role.FRONT_DESK,
    Role.SECURITY,
  )
  @Post('tickets')
  register(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(registerSchema)) dto: z.infer<typeof registerSchema>,
  ) {
    return this.maintenance.registerIssue(actor, {
      ...dto,
      source: MaintSource.STAFF,
      reporterRole: actor.role,
    });
  }

  @Get('tickets')
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: MaintStatus,
    @Query('roomId') roomId?: string,
  ) {
    return this.maintenance.list(user.hotelId, { status, roomId });
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.maintenance.get(user.hotelId, id);
  }

  @Roles(Role.MANAGER, Role.MAINTENANCE)
  @Patch('tickets/:id/status')
  updateStatus(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStatusSchema))
    dto: z.infer<typeof updateStatusSchema>,
  ) {
    return this.maintenance.updateStatus(actor, id, dto.status, dto.note);
  }
}
