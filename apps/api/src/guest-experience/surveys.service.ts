import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../common/actor';
import { ComplaintsService } from './complaints.service';

/** Post-stay guest surveys with Smart Reputation Shielding & Review Funnel. */
@Injectable()
export class SurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complaints: ComplaintsService,
  ) {}

  async submit(
    actor: Actor,
    input: { reservationId: string; score?: number; answers: Record<string, unknown> },
  ) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: input.reservationId, hotelId: actor.hotelId },
      include: { guest: true, hotel: true },
    });

    const survey = await this.prisma.survey.create({
      data: {
        hotelId: actor.hotelId,
        reservationId: input.reservationId,
        score: input.score,
        answers: (input.answers ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Smart Reputation Funnel:
    // If score <= 3 (or <= 6 on a 10-pt scale), intercept as urgent complaint to protect online rating.
    const isDetractor = input.score !== undefined && (input.score <= 3 || (input.score > 5 && input.score <= 6));
    const isPromoter = input.score !== undefined && (input.score >= 4 || input.score >= 7);

    if (isDetractor) {
      const feedbackText =
        (input.answers?.comments as string) ||
        (input.answers?.feedback as string) ||
        `Low rating submitted: ${input.score}/10`;

      const complaint = await this.complaints.create(actor, {
        category: 'GUEST_SURVEY_DETRACTOR',
        description: `[Urgent Survey Intercept] Guest ${reservation?.guest?.name ?? 'Guest'} gave rating ${input.score}: ${feedbackText}`,
        guestId: reservation?.guestId,
        reservationId: input.reservationId,
      });

      return {
        ...survey,
        funneled: 'SHIELDED',
        complaintId: complaint.id,
        message:
          'Thank you for bringing this to our attention. Our Management Team has been alerted to review your feedback privately and resolve any issues.',
      };
    }

    if (isPromoter) {
      const hotelSettings = reservation?.hotel?.settings as Record<string, unknown> | undefined;
      const googleReviewUrl =
        (hotelSettings?.googleReviewUrl as string) ||
        (hotelSettings?.googleMapsUrl as string) ||
        `https://www.google.com/search?q=${encodeURIComponent((reservation?.hotel?.name ?? 'Hotel') + ' reviews')}`;

      return {
        ...survey,
        funneled: 'PUBLIC_PROMOTER',
        googleReviewUrl,
        message:
          'We are thrilled you enjoyed your stay! Please consider sharing your positive experience on Google Maps to help other guests.',
      };
    }

    return {
      ...survey,
      funneled: 'STANDARD',
      message: 'Thank you for your valuable feedback!',
    };
  }

  list(hotelId: string) {
    return this.prisma.survey.findMany({
      where: { hotelId },
      orderBy: { at: 'desc' },
      take: 200,
    });
  }

  /** Average score and a simple NPS-style breakdown (score 0–10). */
  async summary(hotelId: string) {
    const surveys = await this.prisma.survey.findMany({
      where: { hotelId, score: { not: null } },
      select: { score: true },
    });
    const scores = surveys.map((s) => s.score as number);
    const n = scores.length;
    if (n === 0) return { responses: 0, avgScore: null, nps: null };
    const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / n) * 10) / 10;
    const promoters = scores.filter((s) => s >= 9).length;
    const detractors = scores.filter((s) => s <= 6).length;
    const nps = Math.round(((promoters - detractors) / n) * 100);
    return { responses: n, avgScore, nps };
  }
}
