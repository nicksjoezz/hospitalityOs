import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { FrontDeskService } from './front-desk.service';
import { FrontDeskController } from './front-desk.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [FrontDeskController],
  providers: [FrontDeskService],
  exports: [FrontDeskService],
})
export class FrontDeskModule {}
