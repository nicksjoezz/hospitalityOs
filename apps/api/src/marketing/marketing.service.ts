import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { Role } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AnthropicService } from '../ai/anthropic.service';
import { WhatsAppQueueService } from '../channels/whatsapp-queue.service';
import { Actor } from '../common/actor';

/** Estimated cost per business-initiated WhatsApp marketing message (minor units). */
const MARKETING_MSG_COST = 2000; // ₦20.00

export interface Segment {
  all?: boolean;
  vip?: boolean;
}

/**
 * Marketing campaigns (plan.md §11.13). Segment-aware and cost-aware: sending is
 * gated behind approval, recipients are resolved from guest segments, and the
 * estimated WhatsApp template spend is recorded. AI drafts promo copy for approval.
 */
@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly anthropic: AnthropicService,
    private readonly queue: WhatsAppQueueService,
  ) {}

  private async resolveSegment(hotelId: string, segment: Segment) {
    // Only message guests who consented and haven't been erased (consent + GDPR).
    return this.prisma.guest.findMany({
      where: {
        hotelId,
        optedInMarketing: true,
        anonymizedAt: null,
        ...(segment.vip ? { vip: true } : {}),
      },
      select: { id: true, name: true, phone: true, whatsappId: true },
    });
  }

  /** AI-drafted promo copy for approval (deterministic fallback without a key). */
  async draftPromo(hotelId: string, brief: string): Promise<{ draft: string }> {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true },
    });
    if (!this.anthropic.isConfigured()) {
      return {
        draft: `🎉 Special offer from ${hotel.name}! ${brief} Book now and enjoy a great stay. Reply to this message to reserve.`,
      };
    }
    const resp = await this.anthropic.createMessage({
      tier: 'cheap',
      system: `Write a short, friendly WhatsApp marketing message for ${hotel.name} (a hotel). One or two sentences, with a clear call to action. No markdown.`,
      messages: [{ role: 'user', content: brief }],
      maxTokens: 200,
    });
    const draft = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
    return { draft: draft || brief };
  }

  async createCampaign(
    actor: Actor,
    input: {
      name: string;
      channel: string;
      segment: Segment;
      body: string;
      templateId?: string;
      scheduledAt?: Date;
    },
  ) {
    const campaign = await this.prisma.campaign.create({
      data: {
        hotelId: actor.hotelId,
        name: input.name,
        channel: input.channel,
        segment: input.segment as object,
        templateId: input.templateId,
        status: 'DRAFT',
        scheduledAt: input.scheduledAt,
        metrics: { body: input.body } as object,
      },
    });
    await this.audit.record({
      actor,
      action: 'campaign.create',
      entity: 'Campaign',
      entityId: campaign.id,
      after: { id: campaign.id, name: campaign.name },
    });
    return campaign;
  }

  listCampaigns(hotelId: string) {
    return this.prisma.campaign.findMany({
      where: { hotelId },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
    });
  }

  async approve(actor: Actor, id: string) {
    const campaign = await this.get(actor.hotelId, id);
    return this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'APPROVED' },
    });
  }

  /**
   * Send an approved campaign to its segment. Cost-aware: counts recipients and
   * records estimated spend. Real sends require WhatsApp config (else dev-noop).
   */
  async send(actor: Actor, id: string) {
    const campaign = await this.get(actor.hotelId, id);
    if (campaign.status !== 'APPROVED') {
      throw new BadRequestException('Campaign must be APPROVED before sending');
    }
    const segment = (campaign.segment as Segment) ?? {};
    const recipients = await this.resolveSegment(actor.hotelId, segment);
    const body = (campaign.metrics as { body?: string })?.body ?? campaign.name;
    const estimatedCost = recipients.length * MARKETING_MSG_COST;

    let queued = 0;
    for (const g of recipients) {
      const to = g.whatsappId ?? g.phone;
      if (!to) continue;
      // Business-initiated → template (utility/marketing); queued for reliable delivery.
      if (campaign.templateId) {
        await this.queue.enqueueTemplate(to, campaign.templateId, 'en');
      } else {
        await this.queue.enqueueText(to, body);
      }
      queued += 1;
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'SENT',
        metrics: {
          body,
          recipients: recipients.length,
          queued,
          estimatedCost,
        } as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      actor,
      action: 'campaign.send',
      entity: 'Campaign',
      entityId: campaign.id,
      after: { recipients: recipients.length, queued, estimatedCost },
    });
    // Let owner/manager know what was spent.
    await this.prisma.notification.create({
      data: {
        hotelId: actor.hotelId,
        role: Role.MANAGER,
        type: 'marketing.sent',
        title: `Campaign "${campaign.name}" queued`,
        body: `${queued}/${recipients.length} recipients · est. spend recorded`,
        entityRef: campaign.id,
      },
    });
    return updated;
  }

  async get(hotelId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, hotelId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }
}
