import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { loadConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { FxModule } from './fx/fx.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { PlatformGuard } from './auth/platform.guard';
import { TenantGuard } from './auth/tenant.guard';
import { PlatformModule } from './platform/platform.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PaymentsModule } from './payments/payments.module';
import { FrontDeskModule } from './front-desk/front-desk.module';
import { HousekeepingModule } from './housekeeping/housekeeping.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { GuestExperienceModule } from './guest-experience/guest-experience.module';
import { MessagingModule } from './messaging/messaging.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AiModule } from './ai/ai.module';
import { ChannelsModule } from './channels/channels.module';
import { StaffReportsModule } from './staff-reports/staff-reports.module';
import { SecurityModule } from './security/security.module';
import { StaffModule } from './staff/staff.module';
import { InventoryModule } from './inventory/inventory.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { BarModule } from './bar/bar.module';
import { ProcurementModule } from './procurement/procurement.module';
import { RevenueModule } from './revenue/revenue.module';
import { MarketingModule } from './marketing/marketing.module';
import { ReportsModule } from './reports/reports.module';
import { GuestsModule } from './guests/guests.module';
import { GdprModule } from './gdpr/gdpr.module';
import { DiningModule } from './dining/dining.module';
import { PublicModule } from './public/public.module';
import { RoomsModule } from './rooms/rooms.module';
import { UsersModule } from './users/users.module';
import { RatesModule } from './rates/rates.module';
import { PromotionsModule } from './promotions/promotions.module';
import { BillingModule } from './billing/billing.module';
import { NightAuditModule } from './night-audit/night-audit.module';
import { ChannelManagerModule } from './channel-manager/channel-manager.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SyncModule } from './sync/sync.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Load a local apps/api/.env if present, else fall back to the repo-root .env.
      envFilePath: ['.env', '../../.env'],
      load: [() => loadConfig()],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 300),
      },
    ]),
    // Optionally serve the built web SPA from the API (single-domain deploy).
    ...(process.env.SERVE_WEB === 'true'
      ? [
          ServeStaticModule.forRoot({
            rootPath: process.env.WEB_DIST || join(process.cwd(), '..', 'web', 'dist'),
            exclude: ['/api/(.*)'],
          }),
        ]
      : []),
    PrismaModule,
    CommonModule,
    FxModule,
    AuthModule,
    MessagingModule,
    ReservationsModule,
    PaymentsModule,
    FrontDeskModule,
    HousekeepingModule,
    MaintenanceModule,
    GuestExperienceModule,
    DashboardModule,
    AiModule,
    ChannelsModule,
    StaffReportsModule,
    SecurityModule,
    StaffModule,
    InventoryModule,
    RestaurantModule,
    BarModule,
    ProcurementModule,
    RevenueModule,
    MarketingModule,
    ReportsModule,
    GuestsModule,
    GdprModule,
    DiningModule,
    PublicModule,
    RoomsModule,
    UsersModule,
    RatesModule,
    PromotionsModule,
    BillingModule,
    NightAuditModule,
    ChannelManagerModule,
    AuditModule,
    NotificationsModule,
    SyncModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [
    // Per-IP rate limiting (first), then auth, token-audience split, RBAC,
    // and finally tenant status + feature entitlement enforcement.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PlatformGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
