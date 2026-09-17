import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Feature, isoDate, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { MarketingService } from './marketing.service';

const segment = z.object({ all: z.boolean().optional(), vip: z.boolean().optional() });
const campaignSchema = z.object({
  name: z.string().min(1),
  channel: z.string().default('WHATSAPP'),
  segment,
  body: z.string().min(1),
  templateId: z.string().optional(),
  scheduledAt: isoDate.optional(),
});
const draftSchema = z.object({ brief: z.string().min(1) });

@RequireFeature(Feature.MARKETING)
@Roles(Role.OWNER, Role.MANAGER)
@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Post('draft')
  draft(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(draftSchema)) dto: z.infer<typeof draftSchema>,
  ) {
    return this.marketing.draftPromo(user.hotelId, dto.brief);
  }

  @Post('campaigns')
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(campaignSchema)) dto: z.infer<typeof campaignSchema>,
  ) {
    return this.marketing.createCampaign(actor, dto);
  }

  @Get('campaigns')
  list(@CurrentUser() user: AuthUser) {
    return this.marketing.listCampaigns(user.hotelId);
  }

  @Post('campaigns/:id/approve')
  approve(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.marketing.approve(actor, id);
  }

  @Post('campaigns/:id/send')
  send(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.marketing.send(actor, id);
  }
}
