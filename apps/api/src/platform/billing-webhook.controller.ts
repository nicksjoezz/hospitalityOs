import { Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { PlatformBillingService } from './platform-billing.service';

/**
 * Public webhook the master's payment gateway calls when a hotel pays its
 * subscription online. Verified with the platform's own secret key, then the
 * matching invoice is marked paid (and the hotel reinstated if it was suspended).
 */
@Controller('platform/billing/webhook')
export class BillingWebhookController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Public()
  @Post(':provider')
  handle(@Param('provider') provider: string, @Req() req: Request & { rawBody?: Buffer }) {
    return this.billing.handleWebhook(
      provider,
      req.rawBody,
      req.headers as Record<string, unknown>,
    );
  }
}
