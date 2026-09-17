import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { PaymentsModule } from '../payments/payments.module';
import { FrontDeskModule } from '../front-desk/front-desk.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [ReservationsModule, PaymentsModule, FrontDeskModule, MaintenanceModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
