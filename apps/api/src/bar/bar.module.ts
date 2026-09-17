import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PourService } from './pour.service';
import { BarController } from './bar.controller';

@Module({
  imports: [InventoryModule],
  controllers: [BarController],
  providers: [PourService],
  exports: [PourService],
})
export class BarModule {}
