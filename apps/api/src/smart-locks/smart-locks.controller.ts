import { Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { SmartLocksService } from './smart-locks.service';

@Controller('smart-locks')
export class SmartLocksController {
  constructor(private readonly smartLocks: SmartLocksService) {}

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.MAINTENANCE)
  @Get('locks')
  listLocks(@CurrentUser() user: AuthUser) {
    return this.smartLocks.listLocks(user.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('key/:reservationId')
  generateKey(
    @CurrentActor() actor: Actor,
    @Param('reservationId') reservationId: string,
  ) {
    return this.smartLocks.generateRoomKey(actor.hotelId, reservationId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('unlock/:roomId')
  remoteUnlock(
    @CurrentActor() actor: Actor,
    @Param('roomId') roomId: string,
  ) {
    return this.smartLocks.remoteUnlock(actor, roomId);
  }
}
