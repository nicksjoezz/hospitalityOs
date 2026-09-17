import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DashboardGateway } from './dashboard.gateway';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardGateway],
  exports: [DashboardService],
})
export class DashboardModule {}
