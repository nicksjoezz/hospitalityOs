import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentMethod } from '@hospitalityos/shared';
import { AppConfig } from '../../config/configuration';
import {
  InitializeInput,
  InitializeResult,
  PaymentProvider,
  WebhookEvent,
} from './payment-gateway';

/** Paystack hosted checkout + webhook (HMAC-SHA512 of the raw body). */
@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly method = PaymentMethod.PAYSTACK;
  private readonly logger = new Logger(PaystackProvider.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get secret() {
    return this.config.get('PAYSTACK_SECRET_KEY', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.secret);
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.email,
          amount: input.amount,
          currency: input.currency,
          reference: input.reference,
          callback_url: input.redirectUrl,
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        status?: boolean;
        data?: { authorization_url: string; reference: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(`Paystack initialize failed (${res.status})`);
      }
      return {
        authorizationUrl: json.data.authorization_url,
        reference: json.data.reference,
      };
    } catch (e) {
      this.logger.error(`Paystack initialize error: ${e}`);
      throw new Error('Could not start Paystack payment');
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyAndParse(
    rawBody: Buffer | undefined,
    headers: Record<string, unknown>,
  ): WebhookEvent {
    const signature = headers['x-paystack-signature'] as string | undefined;
    if (!this.secret || !rawBody || !signature) {
      return { ok: false, success: false, method: this.method };
    }
    const expected = crypto
      .createHmac('sha512', this.secret)
      .update(rawBody)
      .digest('hex');
    if (expected !== signature) {
      this.logger.warn('Paystack webhook signature mismatch');
      return { ok: false, success: false, method: this.method };
    }
    try {
      const payload = JSON.parse(rawBody.toString()) as {
        event?: string;
        data?: { reference: string; amount: number; currency: string };
      };
      return {
        ok: true,
        success: payload.event === 'charge.success',
        reference: payload.data?.reference,
        amount: payload.data?.amount,
        currency: payload.data?.currency,
        method: this.method,
      };
    } catch {
      this.logger.warn('Paystack webhook body not valid JSON');
      return { ok: false, success: false, method: this.method };
    }
  }
}
