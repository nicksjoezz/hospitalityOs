import { Module } from '@nestjs/common';
import { StaffReportsService } from './staff-reports.service';
import { StaffReportsController } from './staff-reports.controller';

@Module({
  controllers: [StaffReportsController],
  providers: [StaffReportsService],
  exports: [StaffReportsService],
})
export class StaffReportsModule {}
