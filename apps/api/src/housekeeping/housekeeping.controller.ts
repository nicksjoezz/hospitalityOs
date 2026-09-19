import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  HkStatus,
  InspResult,
  MaintCategory,
  Priority,
  Role,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { HousekeepingService } from './housekeeping.service';

const issueSchema = z.object({
  category: z.nativeEnum(MaintCategory),
  priority: z.nativeEnum(Priority).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  photoUrls: z.array(z.string()).optional(),
  takesRoomOutOfService: z.boolean().optional(),
});

@Controller('housekeeping')
export class HousekeepingController {
  constructor(private readonly housekeeping: HousekeepingService) {}

  @Get('tasks')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: HkStatus) {
    return this.housekeeping.list(user.hotelId, status);
  }

  @Roles(Role.MANAGER, Role.HOUSEKEEPING, Role.FRONT_DESK)
  @Post('tasks/:id/assign')
  assign(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    return this.housekeeping.assign(actor, id, userId);
  }

  @Roles(Role.MANAGER, Role.HOUSEKEEPING)
  @Post('tasks/:id/start')
  start(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.housekeeping.start(actor, id);
  }

  @Roles(Role.MANAGER, Role.HOUSEKEEPING)
  @Post('tasks/:id/complete')
  complete(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() body?: { note?: string; photoProof?: string; checklist?: string[] },
  ) {
    return this.housekeeping.complete(actor, id, body);
  }

  @Roles(Role.MANAGER, Role.HOUSEKEEPING)
  @Post('tasks/:id/inspect')
  inspect(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('result') result: InspResult,
    @Body('note') note?: string,
  ) {
    return this.housekeeping.inspect(actor, id, result, note);
  }

  /** Housekeeping → Maintenance hand-off: register an issue from a room task. */
  @Roles(Role.MANAGER, Role.HOUSEKEEPING)
  @Post('tasks/:id/maintenance-issue')
  registerIssue(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(issueSchema)) dto: z.infer<typeof issueSchema>,
  ) {
    return this.housekeeping.registerIssueFromTask(actor, id, dto);
  }
}
