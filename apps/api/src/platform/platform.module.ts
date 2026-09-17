import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformService } from './platform.service';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformController } from './platform.controller';
import { RegistrationController } from './registration.controller';
import { TenantSubscriptionController } from './tenant-subscription.controller';
import { BillingWebhookController } from './billing-webhook.controller';

/**
 * Multi-tenant platform layer: the master controller (platform-admin auth +
 * hotel lifecycle + plans + global settings + subscription billing), public
 * self-registration, the tenant's own subscription view, and the public billing
 * webhook. AuthModule provides JwtModule + AuthService (used to issue hotel
 * tokens on registration / impersonation).
 */
@Module({
  imports: [AuthModule],
  controllers: [
    PlatformAuthController,
    PlatformController,
    RegistrationController,
    TenantSubscriptionController,
    BillingWebhookController,
  ],
  providers: [
    PlatformAuthService,
    PlatformService,
    PlatformSettingsService,
    PlatformBillingService,
  ],
  exports: [PlatformAuthService, PlatformService, PlatformSettingsService, PlatformBillingService],
})
export class PlatformModule {}
