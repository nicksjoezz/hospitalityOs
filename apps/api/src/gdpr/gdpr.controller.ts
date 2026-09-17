import { Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { CurrentActor, Roles } from '../common/decorators';
import { Actor } from '../common/actor';
import { GdprService } from './gdpr.service';

@Controller('gdpr')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('export/:guestId')
  export(@CurrentActor() actor: Actor, @Param('guestId') guestId: string) {
    return this.gdpr.export(actor, guestId);
  }

  @Roles(Role.OWNER)
  @Delete('erase/:guestId')
  erase(@CurrentActor() actor: Actor, @Param('guestId') guestId: string) {
    return this.gdpr.erase(actor, guestId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Patch('marketing-opt-out/:guestId')
  optOut(@CurrentActor() actor: Actor, @Param('guestId') guestId: string) {
    return this.gdpr.marketingOptOut(actor, guestId);
  }
}
