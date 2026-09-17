import { Controller, Post } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';
import { DailyBriefingService } from './daily-briefing.service';

@Roles(Role.OWNER, Role.MANAGER)
@Controller('briefing')
export class BriefingController {
  constructor(private readonly briefing: DailyBriefingService) {}

  /** Trigger the owner briefing immediately (also runs daily at 07:00 via cron). */
  @Post('run')
  run(@CurrentUser() user: AuthUser) {
    return this.briefing.runForHotel(user.hotelId);
  }
}
