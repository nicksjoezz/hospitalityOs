import { Controller, Get, Post } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { NightAuditService } from './night-audit.service';

@Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
@Controller('night-audit')
export class NightAuditController {
  constructor(private readonly nightAudit: NightAuditService) {}

  @Post('run')
  run(@CurrentActor() actor: Actor) {
    return this.nightAudit.run(actor);
  }

  @Get('runs')
  runs(@CurrentUser() user: AuthUser) {
    return this.nightAudit.listRuns(user.hotelId);
  }
}
