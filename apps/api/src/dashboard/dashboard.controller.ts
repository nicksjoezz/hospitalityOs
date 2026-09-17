import { Controller, Get } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles(Role.MANAGER, Role.ACCOUNTANT, Role.FRONT_DESK)
  @Get('snapshot')
  snapshot(@CurrentUser() user: AuthUser) {
    return this.dashboard.snapshot(user.hotelId);
  }
}
