import { Module } from '@nestjs/common';
import { RevenueModule } from '../revenue/revenue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [RevenueModule, InventoryModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
