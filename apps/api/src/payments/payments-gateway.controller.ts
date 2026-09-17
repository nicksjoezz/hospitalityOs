import {
  Body,
  Controller,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Role } from '@hospitalityos/shared';
import { money } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, Public, Roles } from '../common/decorators';
import { Actor } from '../common/actor';
import { PaymentsGatewayService } from './payments-gateway.service';

const initSchema = z.object({
  provider: z.enum(['paystack', 'flutterwave']),
  reservationId: z.string().uuid(),
  amount: money,
});

@Controller('payments')
export class PaymentsGatewayController {
  constructor(private readonly gateway: PaymentsGatewayService) {}

  @Roles(Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
  @Post('gateway/initialize')
  initialize(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(initSchema)) dto: z.infer<typeof initSchema>,
  ) {
    return this.gateway.initialize(actor, dto.provider, dto.reservationId, dto.amount);
  }

  @Public()
  @Post('webhooks/:provider')
  webhook(@Param('provider') provider: string, @Req() req: Request) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    return this.gateway.handleWebhook(
      provider,
      rawBody,
      req.headers as Record<string, unknown>,
    );
  }
}
