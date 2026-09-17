import { Injectable } from '@nestjs/common';
import { Channel } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface ConversationTurn {
  direction: 'IN' | 'OUT';
  body: string;
}

/**
 * Persists conversations and messages across channels (plan.md §6.11). Tracks
 * per-message cost so WhatsApp/AI spend is visible (§7.3, §8).
 */
@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(params: {
    hotelId: string;
    channel: Channel;
    externalId: string;
    guestId?: string;
    userId?: string;
  }) {
    const existing = await this.prisma.conversation.findUnique({
      where: {
        hotelId_channel_externalId: {
          hotelId: params.hotelId,
          channel: params.channel,
          externalId: params.externalId,
        },
      },
    });
    if (existing) {
      if (
        (params.guestId && existing.guestId !== params.guestId) ||
        (params.userId && existing.userId !== params.userId)
      ) {
        return this.prisma.conversation.update({
          where: { id: existing.id },
          data: { guestId: params.guestId, userId: params.userId },
        });
      }
      return existing;
    }
    return this.prisma.conversation.create({
      data: {
        hotelId: params.hotelId,
        channel: params.channel,
        externalId: params.externalId,
        guestId: params.guestId,
        userId: params.userId,
      },
    });
  }

  async recordInbound(conversationId: string, body: string, mediaUrls: string[] = []) {
    const [msg] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, direction: 'IN', body, mediaUrls },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return msg;
  }

  async recordOutbound(
    conversationId: string,
    body: string,
    opts: { aiGenerated?: boolean; templateName?: string; cost?: number } = {},
  ) {
    const [msg] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          direction: 'OUT',
          body,
          aiGenerated: opts.aiGenerated ?? false,
          templateName: opts.templateName,
          cost: opts.cost,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return msg;
  }

  /** Recent turns for AI context, oldest first. */
  async recentTurns(conversationId: string, limit = 12): Promise<ConversationTurn[]> {
    const msgs = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { at: 'desc' },
      take: limit,
    });
    return msgs
      .reverse()
      .map((m) => ({ direction: m.direction as 'IN' | 'OUT', body: m.body }));
  }

  /** Whether the inbound 24h free service window is open (plan.md §8). */
  async isWithinServiceWindow(conversationId: string): Promise<boolean> {
    const lastInbound = await this.prisma.message.findFirst({
      where: { conversationId, direction: 'IN' },
      orderBy: { at: 'desc' },
    });
    if (!lastInbound) return false;
    return Date.now() - lastInbound.at.getTime() < 24 * 3600 * 1000;
  }
}
