import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { HousekeepingService } from './housekeeping.service';
import { HousekeepingController } from './housekeeping.controller';

@Module({
  imports: [MaintenanceModule],
  controllers: [HousekeepingController],
  providers: [HousekeepingService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
