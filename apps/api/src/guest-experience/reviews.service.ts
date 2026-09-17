import { Injectable, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { Role } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AnthropicService } from '../ai/anthropic.service';
import { Actor } from '../common/actor';

export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

const POSITIVE_WORDS = ['great', 'excellent', 'clean', 'friendly', 'love', 'amazing', 'comfortable', 'recommend', 'wonderful', 'perfect'];
const NEGATIVE_WORDS = ['dirty', 'rude', 'broken', 'noise', 'noisy', 'cold', 'slow', 'bad', 'terrible', 'poor', 'smell', 'leak', 'disappointed'];
const TOPIC_KEYWORDS: Record<string, RegExp> = {
  cleanliness: /\b(clean|dirty|tidy|spotless|stain|smell)\b/i,
  staff: /\b(staff|reception|service|friendly|rude|helpful)\b/i,
  room: /\b(room|bed|bathroom|ac|air ?con|tv|wifi|shower)\b/i,
  food: /\b(food|breakfast|restaurant|meal|dinner)\b/i,
  value: /\b(price|value|expensive|cheap|worth)\b/i,
  noise: /\b(noise|noisy|loud|quiet)\b/i,
};

/**
 * Guest reviews (plan.md §11.11): ingestion, AI sentiment + topic tagging, and
 * AI-drafted replies that require approval before posting. Heuristic fallback
 * keeps it working without an API key.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly anthropic: AnthropicService,
  ) {}

  private heuristicSentiment(text: string): Sentiment {
    const t = text.toLowerCase();
    const pos = POSITIVE_WORDS.filter((w) => t.includes(w)).length;
    const neg = NEGATIVE_WORDS.filter((w) => t.includes(w)).length;
    if (neg > pos) return 'NEGATIVE';
    if (pos > neg) return 'POSITIVE';
    return 'NEUTRAL';
  }

  private topics(text: string): string[] {
    return Object.entries(TOPIC_KEYWORDS)
      .filter(([, re]) => re.test(text))
      .map(([k]) => k);
  }

  /** Ingest a review and tag sentiment/topics (rating-aware). */
  async ingest(
    actor: Actor,
    input: {
      source: string;
      rating: number;
      text?: string;
      guestId?: string;
      reservationId?: string;
      externalId?: string;
    },
  ) {
    // Dedupe external reviews (OTA/Google) by provider id.
    if (input.externalId) {
      const existing = await this.prisma.review.findFirst({
        where: { hotelId: actor.hotelId, source: input.source, externalId: input.externalId },
      });
      if (existing) return existing;
    }
    const text = input.text ?? '';
    // Rating dominates; text nuances it.
    let sentiment: Sentiment =
      input.rating >= 4 ? 'POSITIVE' : input.rating <= 2 ? 'NEGATIVE' : 'NEUTRAL';
    if (text) {
      const fromText = this.heuristicSentiment(text);
      if (input.rating === 3) sentiment = fromText;
    }
    const topics = text ? this.topics(text) : [];

    const review = await this.prisma.review.create({
      data: {
        hotelId: actor.hotelId,
        source: input.source,
        externalId: input.externalId,
        rating: input.rating,
        text: input.text,
        guestId: input.guestId,
        reservationId: input.reservationId,
        sentiment,
        topics,
        replyStatus: 'NONE',
      },
    });

    if (sentiment === 'NEGATIVE') {
      await this.prisma.notification.create({
        data: {
          hotelId: actor.hotelId,
          role: Role.MANAGER,
          type: 'review.negative',
          title: `Negative review (${input.rating}★)`,
          body: (input.text ?? '').slice(0, 140),
          entityRef: review.id,
        },
      });
    }
    return review;
  }

  /** AI-draft a reply (requires approval before "posting"). */
  async draftReply(actor: Actor, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, hotelId: actor.hotelId },
    });
    if (!review) throw new NotFoundException('Review not found');
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: actor.hotelId },
      select: { name: true },
    });

    let draft: string;
    if (this.anthropic.isConfigured()) {
      const resp = await this.anthropic.createMessage({
        tier: 'balanced',
        system: `You are the guest relations manager at ${hotel.name}. Write a warm, professional, specific public reply to this ${review.rating}-star review. Acknowledge concerns, avoid generic platitudes, keep it under 80 words. No markdown.`,
        messages: [{ role: 'user', content: review.text ?? `(${review.rating} star rating, no text)` }],
        maxTokens: 300,
      });
      draft = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim();
    } else {
      draft =
        review.sentiment === 'NEGATIVE'
          ? `Thank you for your feedback. We're sorry your stay at ${hotel.name} fell short — we take your comments seriously and are addressing them. We'd welcome the chance to make it right.`
          : `Thank you for staying at ${hotel.name} and for the kind words! We hope to welcome you back soon.`;
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { replyDraft: draft, replyStatus: 'DRAFTED' },
    });
    return { reviewId, replyDraft: updated.replyDraft, replyStatus: updated.replyStatus };
  }

  /** Approve (post) or reject a drafted reply (human approval, plan.md §7.1). */
  async decideReply(actor: Actor, reviewId: string, decision: 'approve' | 'reject') {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, hotelId: actor.hotelId },
    });
    if (!review) throw new NotFoundException('Review not found');
    const replyStatus = decision === 'approve' ? 'POSTED' : 'REJECTED';
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { replyStatus },
    });
    await this.audit.record({
      actor,
      action: `review.reply_${decision}`,
      entity: 'Review',
      entityId: reviewId,
      after: { replyStatus },
    });
    return updated;
  }

  list(hotelId: string, sentiment?: Sentiment) {
    return this.prisma.review.findMany({
      where: { hotelId, ...(sentiment ? { sentiment } : {}) },
      orderBy: { at: 'desc' },
      take: 200,
    });
  }

  /** Aggregate satisfaction + most-common topics for the dashboard (§11.11). */
  async summary(hotelId: string) {
    const reviews = await this.prisma.review.findMany({ where: { hotelId } });
    const count = reviews.length;
    const avgRating = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : null;
    const bySentiment = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 } as Record<string, number>;
    const topicCounts: Record<string, number> = {};
    for (const r of reviews) {
      if (r.sentiment) bySentiment[r.sentiment] = (bySentiment[r.sentiment] ?? 0) + 1;
      for (const t of r.topics) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, n]) => ({ topic, count: n }));
    return {
      count,
      avgRating: avgRating === null ? null : Math.round(avgRating * 10) / 10,
      bySentiment,
      topTopics,
    };
  }
}
