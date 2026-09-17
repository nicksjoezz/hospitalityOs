import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { GuestExperienceModule } from '../guest-experience/guest-experience.module';
import { HousekeepingModule } from '../housekeeping/housekeeping.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { StaffReportsModule } from '../staff-reports/staff-reports.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { RevenueModule } from '../revenue/revenue.module';
import { PaymentsModule } from '../payments/payments.module';
import { AnthropicModule } from './anthropic.module';
import { ToolsService } from './tools.service';
import { OrchestratorService } from './orchestrator.service';
import { GmService } from './gm.service';
import { GmController } from './gm.controller';

@Module({
  imports: [
    AnthropicModule,
    ReservationsModule,
    MaintenanceModule,
    GuestExperienceModule,
    HousekeepingModule,
    DashboardModule,
    StaffReportsModule,
    InventoryModule,
    RestaurantModule,
    ProcurementModule,
    RevenueModule,
    PaymentsModule,
  ],
  controllers: [GmController],
  providers: [ToolsService, OrchestratorService, GmService],
  exports: [OrchestratorService],
})
export class AiModule {}
