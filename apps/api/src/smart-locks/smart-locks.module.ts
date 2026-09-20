import { Global, Module } from '@nestjs/common';
import { SmartLocksService } from './smart-locks.service';
import { SmartLocksController } from './smart-locks.controller';

@Global()
@Module({
  controllers: [SmartLocksController],
  providers: [SmartLocksService],
  exports: [SmartLocksService],
})
export class SmartLocksModule {}
