import {
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Channel } from '@hospitalityos/shared';
import { Public } from '../common/decorators';
import { IdempotencyService } from '../common/idempotency.service';
import { OrchestratorService } from '../ai/orchestrator.service';
import { WhatsAppCloudAdapter } from './whatsapp.adapter';
import { WhatsAppQueueService } from './whatsapp-queue.service';

/**
 * WhatsApp Cloud API webhook (plan.md §8). GET handles Meta's verification
 * handshake. POST verifies the signature, dedupes by provider message id
 * (idempotent), routes to the AI orchestrator, and sends the reply.
 */
@Public()
@Controller('channels/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly adapter: WhatsAppCloudAdapter,
    private readonly queue: WhatsAppQueueService,
    private readonly orchestrator: OrchestratorService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const result = this.adapter.verifySubscription(mode, token, challenge);
    if (result === null) {
      res.status(403).send('forbidden');
      return;
    }
    res.status(200).type('text/plain').send(result);
  }

  @Post('webhook')
  async receive(@Req() req: Request, @Res() res: Response): Promise<void> {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!this.adapter.verifySignature(rawBody, signature)) {
      this.logger.warn('Rejected webhook with invalid signature');
      res.status(401).send('invalid signature');
      return;
    }

    // Always 200 fast so Meta doesn't retry; process inline (Phase 1).
    res.status(200).json({ status: 'ok' });

    try {
      const inbounds = this.adapter.parseWebhook(req.body);
      for (const inbound of inbounds) {
        // Dedupe by provider message id — webhooks can be redelivered.
        await this.idempotency.run(
          { key: `wa:${inbound.messageId}`, method: 'POST', path: '/channels/whatsapp/webhook' },
          async () => {
            const reply = await this.orchestrator.handleInbound({
              channel: Channel.WHATSAPP,
              externalId: inbound.from,
              from: inbound.from,
              text: inbound.text,
              senderName: inbound.senderName,
              phoneNumberId: inbound.phoneNumberId,
            });
            await this.queue.enqueueText(inbound.from, reply);
            return { handled: true };
          },
        );
      }
    } catch (e) {
      this.logger.error(`Webhook processing error: ${e}`);
    }
  }
}
