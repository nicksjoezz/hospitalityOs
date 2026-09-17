import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { ActorType, Channel } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService, ConversationTurn } from '../messaging/messaging.service';
import { Actor } from '../common/actor';
import { AnthropicService } from './anthropic.service';
import { ToolsService, ToolContext } from './tools.service';
import { toolsForAudience, ToolAudience } from './tool-definitions';

const MAX_TOOL_LOOPS = 6;
const FALLBACK_REPLY =
  'Thanks for your message! Our team will get back to you shortly.';

export interface InboundMessage {
  channel: Channel;
  /** Stable conversation key, e.g. the sender's WhatsApp id. */
  externalId: string;
  from: string;
  text: string;
  senderName?: string;
  /** Business phone number id (multi-tenant hotel routing). */
  phoneNumberId?: string;
}

/**
 * AI orchestration loop (plan.md §7.2). Identifies the sender, builds a tool-
 * enabled request to Claude, executes any tool calls against deterministic
 * services, and composes the reply. The AI never mutates state directly.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly tools: ToolsService,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * Resolve the hotel for an inbound message. Multi-tenant: match the business
   * phone number id against `Hotel.settings.whatsappPhoneNumberId`; fall back to
   * the only/first hotel for single-tenant deployments.
   */
  async resolveHotelId(phoneNumberId?: string): Promise<string | null> {
    if (phoneNumberId) {
      const matched = await this.prisma.hotel.findFirst({
        where: { settings: { path: ['whatsappPhoneNumberId'], equals: phoneNumberId } },
        select: { id: true },
      });
      if (matched) return matched.id;
    }
    const hotel = await this.prisma.hotel.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return hotel?.id ?? null;
  }

  async handleInbound(inbound: InboundMessage): Promise<string> {
    const hotelId = await this.resolveHotelId(inbound.phoneNumberId);
    if (!hotelId) return FALLBACK_REPLY;

    const sender = await this.resolveSender(hotelId, inbound.from, inbound.senderName);
    const conversation = await this.messaging.getOrCreateConversation({
      hotelId,
      channel: inbound.channel,
      externalId: inbound.externalId,
      guestId: sender.audience === 'guest' ? sender.guestId : undefined,
      userId: sender.audience === 'staff' ? sender.userId : undefined,
    });
    await this.messaging.recordInbound(conversation.id, inbound.text);

    // Marketing consent: honour STOP/UNSUBSCRIBE keywords (anti-spam compliance).
    if (sender.audience === 'guest' && sender.guestId && /^\s*(stop|unsubscribe|opt[\s-]?out)\s*$/i.test(inbound.text)) {
      await this.prisma.guest.update({
        where: { id: sender.guestId },
        data: { optedInMarketing: false },
      });
      const reply = "You've been unsubscribed from marketing messages. Reply START to opt back in.";
      await this.messaging.recordOutbound(conversation.id, reply);
      return reply;
    }
    if (sender.audience === 'guest' && sender.guestId && /^\s*start\s*$/i.test(inbound.text)) {
      await this.prisma.guest.update({
        where: { id: sender.guestId },
        data: { optedInMarketing: true },
      });
      const reply = "You're subscribed again. We'll keep you posted on offers.";
      await this.messaging.recordOutbound(conversation.id, reply);
      return reply;
    }

    if (!this.anthropic.isConfigured()) {
      await this.messaging.recordOutbound(conversation.id, FALLBACK_REPLY);
      return FALLBACK_REPLY;
    }

    const turns = await this.messaging.recentTurns(conversation.id);
    let reply: string;
    try {
      reply = await this.runLoop(hotelId, sender, turns);
    } catch (e) {
      this.logger.error(`Orchestrator error: ${e}`);
      reply = FALLBACK_REPLY;
    }

    await this.messaging.recordOutbound(conversation.id, reply, { aiGenerated: true });
    return reply;
  }

  private async runLoop(
    hotelId: string,
    sender: ResolvedSender,
    turns: ConversationTurn[],
  ): Promise<string> {
    const system = await this.systemPrompt(hotelId, sender);
    const ctx: ToolContext = {
      actor: this.actorFor(hotelId, sender),
      audience: sender.audience,
      guestId: sender.guestId,
      roomId: sender.roomId,
    };
    const tools = toolsForAudience(sender.audience);
    const messages = toMessages(turns);

    for (let i = 0; i < MAX_TOOL_LOOPS; i++) {
      const resp = await this.anthropic.createMessage({
        tier: 'balanced',
        system,
        messages,
        tools,
        maxTokens: 1024,
      });

      if (resp.stop_reason === 'tool_use') {
        messages.push({
          role: 'assistant',
          content: resp.content as unknown as Anthropic.MessageParam['content'],
        });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use') continue;
          let result: unknown;
          try {
            result = await this.tools.execute(block.name, block.input, ctx);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      return textOf(resp) || FALLBACK_REPLY;
    }
    this.logger.warn('Tool-loop cap reached');
    return 'Sorry, I could not complete that just now. A staff member will follow up.';
  }

  private actorFor(hotelId: string, sender: ResolvedSender): Actor {
    // AI-initiated actions are audited as actorType=AI, carrying the human id.
    return {
      type: ActorType.AI,
      hotelId,
      id: sender.audience === 'staff' ? sender.userId : sender.guestId,
      role: sender.role,
    };
  }

  private async resolveSender(
    hotelId: string,
    from: string,
    name?: string,
  ): Promise<ResolvedSender> {
    // Staff if the number maps to a user.
    const user = await this.prisma.user.findFirst({
      where: {
        hotelId,
        active: true,
        deletedAt: null,
        OR: [{ whatsappId: from }, { phone: from }],
      },
    });
    if (user) {
      return { audience: 'staff', userId: user.id, role: user.role, name: user.name };
    }

    // Otherwise a guest — find or create by whatsappId/phone.
    let guest = await this.prisma.guest.findFirst({
      where: { hotelId, OR: [{ whatsappId: from }, { phone: from }] },
    });
    guest ??= await this.prisma.guest.create({
      data: { hotelId, name: name ?? 'Guest', phone: from, whatsappId: from },
    });
    // Their current in-house room, if any (for room-scoped actions).
    const inHouse = await this.prisma.reservation.findFirst({
      where: { hotelId, guestId: guest.id, status: 'CHECKED_IN' },
      select: { roomId: true },
    });
    return {
      audience: 'guest',
      guestId: guest.id,
      name: guest.name,
      roomId: inHouse?.roomId ?? undefined,
    };
  }

  private async systemPrompt(hotelId: string, sender: ResolvedSender): Promise<string> {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true, currency: true, timezone: true },
    });
    const today = new Date().toISOString().slice(0, 10);
    const roleLine =
      sender.audience === 'staff'
        ? `You are assisting a STAFF member (role: ${sender.role}). Offer role-appropriate operational help.`
        : `You are assisting a GUEST. Be warm, concise, and helpful.`;
    return [
      `You are the AI assistant for ${hotel.name}, a hotel. Today is ${today}. Hotel currency is ${hotel.currency}; timezone ${hotel.timezone}.`,
      roleLine,
      'CRITICAL RULES:',
      '- Availability, prices, bookings, payments and ticket data come ONLY from tool calls. Never invent or guess them.',
      '- Money values from tools are in minor units (e.g. kobo/cents). Convert to a human amount when replying.',
      '- Before creating a reservation, confirm dates, room type and price with the person.',
      '- Keep replies short and friendly, suitable for WhatsApp.',
      '- If a request is out of scope or you lack a tool for it, say a staff member will help — do not fabricate policy.',
    ].join('\n');
  }
}

interface ResolvedSender {
  audience: ToolAudience;
  userId?: string;
  guestId?: string;
  role?: import('@hospitalityos/shared').Role;
  name?: string;
  roomId?: string;
}

/** Convert stored turns to Claude messages, merging consecutive same-role turns. */
function toMessages(turns: ConversationTurn[]): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];
  for (const t of turns) {
    const role: 'user' | 'assistant' = t.direction === 'IN' ? 'user' : 'assistant';
    const last = msgs[msgs.length - 1];
    if (last && last.role === role && typeof last.content === 'string') {
      last.content += `\n${t.body}`;
    } else {
      msgs.push({ role, content: t.body });
    }
  }
  // The API must start with a user turn.
  while (msgs.length > 0 && msgs[0].role !== 'user') msgs.shift();
  if (msgs.length === 0) msgs.push({ role: 'user', content: 'Hello' });
  return msgs;
}

function textOf(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
