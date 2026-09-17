import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { RevenueModule } from '../revenue/revenue.module';
import { WhatsAppCloudAdapter } from './whatsapp.adapter';
import { WhatsAppQueueService } from './whatsapp-queue.service';
import { WhatsAppController } from './whatsapp.controller';
import { ReceiptsService } from './receipts.service';
import { EmailService } from './email.service';
import { DailyBriefingService } from './daily-briefing.service';
import { BriefingController } from './briefing.controller';
import { TemplatesController } from './templates.controller';

@Module({
  imports: [AiModule, DashboardModule, RevenueModule],
  controllers: [WhatsAppController, BriefingController, TemplatesController],
  providers: [
    WhatsAppCloudAdapter,
    WhatsAppQueueService,
    EmailService,
    ReceiptsService,
    DailyBriefingService,
  ],
  exports: [WhatsAppCloudAdapter, WhatsAppQueueService, EmailService],
})
export class ChannelsModule {}
