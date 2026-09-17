import { Injectable } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { formatMoney } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { LossService } from '../inventory/loss.service';
import { RevenueService } from '../revenue/revenue.service';
import { AnthropicService } from './anthropic.service';

/**
 * The owner-facing cross-department "AI General Manager" (plan.md §11.14).
 * Answers natural-language questions by narrating deterministically-computed
 * numbers from across departments — it never invents figures.
 */
@Injectable()
export class GmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly revenue: RevenueService,
    private readonly loss: LossService,
    private readonly anthropic: AnthropicService,
  ) {}

  /** Assemble a deterministic, cross-department context snapshot. */
  async buildContext(hotelId: string): Promise<string> {
    const [summary, analytics, lossAlerts, hotel] = await Promise.all([
      this.dashboard.textSummary(hotelId),
      this.revenue.analytics(
        hotelId,
        new Date(Date.now() - 30 * 86_400_000),
        new Date(),
      ),
      this.loss.getAlerts(hotelId),
      this.prisma.hotel.findUniqueOrThrow({
        where: { id: hotelId },
        select: { currency: true },
      }),
    ]);
    const m = (n: number) => formatMoney(n, hotel.currency);
    const lossLines =
      lossAlerts.length > 0
        ? lossAlerts
            .slice(0, 5)
            .map((a) => `- ${a.name}: ${a.variancePct}% below expected (${a.probableCause})`)
            .join('\n')
        : '- none';

    return [
      '== OPERATIONS (today) ==',
      summary,
      '',
      '== REVENUE (last 30 days) ==',
      `Occupancy: ${analytics.occupancyPct}%`,
      `ADR: ${m(analytics.adr)}   RevPAR: ${m(analytics.revpar)}`,
      `Room revenue: ${m(analytics.roomRevenue)} over ${analytics.soldRoomNights}/${analytics.availableRoomNights} room-nights`,
      '',
      '== LOSS / SHRINKAGE ALERTS ==',
      lossLines,
    ].join('\n');
  }

  async ask(hotelId: string, question: string): Promise<{ answer: string; context: string }> {
    const context = await this.buildContext(hotelId);

    if (!this.anthropic.isConfigured()) {
      return { answer: `Here is the current cross-department status:\n\n${context}`, context };
    }

    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true, currency: true },
    });
    const system = [
      `You are the AI General Manager for ${hotel.name}. Currency: ${hotel.currency}.`,
      'Answer the owner using ONLY the figures in the context below. Never invent numbers.',
      'Be concise, specific and action-oriented; call out anomalies (loss, low occupancy, overdue work).',
      '',
      context,
    ].join('\n');

    const resp = await this.anthropic.createMessage({
      tier: 'smart',
      system,
      messages: [{ role: 'user', content: question }],
      maxTokens: 800,
    });
    const answer = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { answer: answer || context, context };
  }
}
