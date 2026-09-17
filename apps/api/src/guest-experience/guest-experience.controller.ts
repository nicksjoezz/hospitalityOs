import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { ComplaintsService } from './complaints.service';
import { ReviewsService, Sentiment } from './reviews.service';
import { SurveysService } from './surveys.service';

const complaintSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  guestId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
});
const reviewSchema = z.object({
  source: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().optional(),
  guestId: z.string().uuid().optional(),
  reservationId: z.string().uuid().optional(),
  externalId: z.string().optional(), // OTA/Google review id (deduped on ingest)
});
const surveySchema = z.object({
  reservationId: z.string().uuid(),
  score: z.number().int().min(0).max(10).optional(),
  answers: z.record(z.unknown()).default({}),
});

@RequireFeature(Feature.REVIEWS)
@Controller('guest-experience')
export class GuestExperienceController {
  constructor(
    private readonly complaints: ComplaintsService,
    private readonly reviews: ReviewsService,
    private readonly surveys: SurveysService,
  ) {}

  // ---- Complaints ----
  @Post('complaints')
  createComplaint(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(complaintSchema)) dto: z.infer<typeof complaintSchema>,
  ) {
    return this.complaints.create(actor, dto);
  }

  @Get('complaints')
  listComplaints(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.complaints.list(user.hotelId, status);
  }

  // ---- Reviews ----
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('reviews')
  ingestReview(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(reviewSchema)) dto: z.infer<typeof reviewSchema>,
  ) {
    return this.reviews.ingest(actor, dto);
  }

  @Get('reviews')
  listReviews(@CurrentUser() user: AuthUser, @Query('sentiment') sentiment?: Sentiment) {
    return this.reviews.list(user.hotelId, sentiment);
  }

  @Get('reviews/summary')
  reviewSummary(@CurrentUser() user: AuthUser) {
    return this.reviews.summary(user.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('reviews/:id/draft-reply')
  draftReply(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.reviews.draftReply(actor, id);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('reviews/:id/reply/:decision')
  decideReply(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('decision') decision: 'approve' | 'reject',
  ) {
    return this.reviews.decideReply(actor, id, decision === 'approve' ? 'approve' : 'reject');
  }

  // ---- Surveys ----
  @Post('surveys')
  submitSurvey(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(surveySchema)) dto: z.infer<typeof surveySchema>,
  ) {
    return this.surveys.submit(actor, dto);
  }

  @Get('surveys')
  listSurveys(@CurrentUser() user: AuthUser) {
    return this.surveys.list(user.hotelId);
  }

  @Get('surveys/summary')
  surveySummary(@CurrentUser() user: AuthUser) {
    return this.surveys.summary(user.hotelId);
  }
}
