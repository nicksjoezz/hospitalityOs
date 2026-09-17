import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceReportService } from './maintenance-report.service';
import { MaintenanceReportController } from './maintenance-report.controller';
import { PmService } from './pm.service';
import { PmController } from './pm.controller';
import { GeneratorService } from './generator.service';
import { GeneratorController } from './generator.controller';

@Module({
  controllers: [
    MaintenanceController,
    MaintenanceReportController,
    PmController,
    GeneratorController,
  ],
  providers: [
    MaintenanceService,
    MaintenanceReportService,
    PmService,
    GeneratorService,
  ],
  exports: [MaintenanceService, GeneratorService],
})
export class MaintenanceModule {}
