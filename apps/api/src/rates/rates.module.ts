import { Module } from '@nestjs/common';
import { RatesService } from './rates.service';
import { PricingService } from './pricing.service';
import { RatesController } from './rates.controller';

@Module({
  controllers: [RatesController],
  providers: [RatesService, PricingService],
  exports: [RatesService, PricingService],
})
export class RatesModule {}
