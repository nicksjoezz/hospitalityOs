import { Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import {
  AllowSuspended,
  CurrentUser,
  AuthUser,
  Roles,
} from '../common/decorators';
import { PlatformService } from './platform.service';
import { PlatformBillingService } from './platform-billing.service';

/**
 * Hotel-facing self-service view of its own subscription + invoices. @AllowSuspended
 * so a suspended tenant can still see why and pay/clear an overdue invoice.
 */
@Controller('tenant')
export class TenantSubscriptionController {
  constructor(
    private readonly platform: PlatformService,
    private readonly billing: PlatformBillingService,
  ) {}

  @AllowSuspended()
  @Get('subscription')
  subscription(@CurrentUser() user: AuthUser) {
    return this.platform.getSubscription(user.hotelId);
  }

  @AllowSuspended()
  @Get('invoices')
  invoices(@CurrentUser() user: AuthUser) {
    return this.billing.listInvoices({ hotelId: user.hotelId });
  }

  @AllowSuspended()
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  @Post('invoices/:id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billing.initOnlinePayment(user.hotelId, id);
  }

  @AllowSuspended()
  @Roles(Role.OWNER, Role.MANAGER)
  @Post('request-approval')
  requestApproval(@CurrentUser() user: AuthUser) {
    return this.platform.requestApproval(user.hotelId, user.id);
  }
}
