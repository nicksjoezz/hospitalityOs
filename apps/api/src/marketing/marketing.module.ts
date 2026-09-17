import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';

// AnthropicService is provided globally (AnthropicModule); ChannelsModule gives
// the WhatsApp adapter for sending campaigns.
@Module({
  imports: [ChannelsModule],
  controllers: [MarketingController],
  providers: [MarketingService],
})
export class MarketingModule {}
