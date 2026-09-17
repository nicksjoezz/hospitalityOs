import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { WaitlistService } from './waitlist.service';
import { DiningController } from './dining.controller';

@Module({
  controllers: [DiningController],
  providers: [TablesService, WaitlistService],
  exports: [TablesService],
})
export class DiningModule {}
