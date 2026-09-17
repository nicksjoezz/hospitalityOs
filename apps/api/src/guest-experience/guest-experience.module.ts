import { Module } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { ReviewsService } from './reviews.service';
import { SurveysService } from './surveys.service';
import { GuestExperienceController } from './guest-experience.controller';

// AnthropicService is global (AnthropicModule); no AI module import needed.
@Module({
  controllers: [GuestExperienceController],
  providers: [ComplaintsService, ReviewsService, SurveysService],
  exports: [ComplaintsService, ReviewsService, SurveysService],
})
export class GuestExperienceModule {}
