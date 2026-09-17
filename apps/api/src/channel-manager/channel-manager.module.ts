import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ChannelManagerService } from './channel-manager.service';
import { ChannelManagerController } from './channel-manager.controller';

@Module({
  imports: [RatesModule, ReservationsModule],
  controllers: [ChannelManagerController],
  providers: [ChannelManagerService],
})
export class ChannelManagerModule {}
