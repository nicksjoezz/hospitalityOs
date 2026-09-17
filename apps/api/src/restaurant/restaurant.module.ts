import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AuthModule } from '../auth/auth.module';
import { MenuService } from './menu.service';
import { OrdersService } from './orders.service';
import { RestaurantController } from './restaurant.controller';
import { KitchenGateway } from './kitchen.gateway';
import { EscposService } from './escpos.service';

@Module({
  imports: [InventoryModule, AuthModule],
  controllers: [RestaurantController],
  providers: [MenuService, OrdersService, KitchenGateway, EscposService],
  exports: [OrdersService, MenuService, EscposService],
})
export class RestaurantModule {}
