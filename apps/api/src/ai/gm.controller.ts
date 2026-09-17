import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { Feature, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { GmService } from './gm.service';

const askSchema = z.object({ question: z.string().min(2).max(2000) });

@RequireFeature(Feature.AI_ASSISTANT)
@Roles(Role.OWNER, Role.MANAGER)
@Controller('gm')
export class GmController {
  constructor(private readonly gm: GmService) {}

  /** Owner AI-GM chat: "how is the hotel today?" etc. */
  @Post('ask')
  ask(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(askSchema)) dto: z.infer<typeof askSchema>,
  ) {
    return this.gm.ask(user.hotelId, dto.question);
  }
}
