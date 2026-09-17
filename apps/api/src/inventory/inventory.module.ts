import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { LossService } from './loss.service';
import { InventoryController } from './inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, LossService],
  exports: [InventoryService, LossService],
})
export class InventoryModule {}
