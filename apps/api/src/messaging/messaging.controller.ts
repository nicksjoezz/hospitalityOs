import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Channel, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, Roles } from '../common/decorators';
import { Actor } from '../common/actor';
import { MessagingService } from './messaging.service';

const sendMsgSchema = z.object({
  body: z.string().min(1).max(4000),
  templateName: z.string().optional(),
  aiGenerated: z.boolean().optional(),
});

const statusSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED']),
});

const startConvSchema = z.object({
  channel: z.nativeEnum(Channel),
  externalId: z.string().min(1),
  guestId: z.string().uuid().optional(),
  initialMessage: z.string().optional(),
});

@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Get('conversations')
  async listConversations(
    @CurrentActor() actor: Actor,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.messaging.listConversations(actor.hotelId, {
      channel,
      status,
      search,
    });
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Get('stats')
  async getStats(@CurrentActor() actor: Actor) {
    return this.messaging.getStats(actor.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Get('conversations/:id')
  async getConversation(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ) {
    return this.messaging.getConversation(actor.hotelId, id);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('conversations/:id/messages')
  async sendMessage(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMsgSchema)) dto: z.infer<typeof sendMsgSchema>,
  ) {
    // Verify ownership
    await this.messaging.getConversation(actor.hotelId, id);
    return this.messaging.recordOutbound(id, dto.body, {
      templateName: dto.templateName,
      aiGenerated: dto.aiGenerated,
    });
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('conversations/:id/ai-suggest')
  async suggestAi(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ) {
    return this.messaging.generateAiSuggestion(actor.hotelId, id);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Patch('conversations/:id/status')
  async updateStatus(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) dto: z.infer<typeof statusSchema>,
  ) {
    return this.messaging.updateStatus(actor.hotelId, id, dto.status);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('conversations')
  async startConversation(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(startConvSchema)) dto: z.infer<typeof startConvSchema>,
  ) {
    const conv = await this.messaging.getOrCreateConversation({
      hotelId: actor.hotelId,
      channel: dto.channel,
      externalId: dto.externalId,
      guestId: dto.guestId,
    });

    if (dto.initialMessage) {
      await this.messaging.recordOutbound(conv.id, dto.initialMessage);
    }

    return conv;
  }
}
