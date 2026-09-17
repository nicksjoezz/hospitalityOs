import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { PaymentsModule } from '../payments/payments.module';
import { PublicController } from './public.controller';

@Module({
  imports: [ReservationsModule, RestaurantModule, PaymentsModule],
  controllers: [PublicController],
})
export class PublicModule {}
