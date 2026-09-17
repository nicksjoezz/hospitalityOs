import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CashDrawerService } from './cash-drawer.service';
import { CashDrawerController } from './cash-drawer.controller';
import { PaymentsGatewayService } from './payments-gateway.service';
import { PaymentsGatewayController } from './payments-gateway.controller';
import { PaystackProvider } from './providers/paystack.provider';
import { FlutterwaveProvider } from './providers/flutterwave.provider';

import { DynamicAccountsService } from './dynamic-accounts.service';
import { VirtualAccountsController } from './virtual-accounts.controller';

@Module({
  controllers: [
    PaymentsController,
    CashDrawerController,
    PaymentsGatewayController,
    VirtualAccountsController,
  ],
  providers: [
    PaymentsService,
    CashDrawerService,
    PaymentsGatewayService,
    DynamicAccountsService,
    PaystackProvider,
    FlutterwaveProvider,
  ],
  exports: [
    PaymentsService,
    CashDrawerService,
    PaymentsGatewayService,
    DynamicAccountsService,
  ],
})
export class PaymentsModule {}
