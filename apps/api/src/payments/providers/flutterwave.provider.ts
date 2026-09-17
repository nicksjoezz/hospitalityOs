import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@hospitalityos/shared';
import { toMajorUnits, toMinorUnits } from '@hospitalityos/shared';
import { AppConfig } from '../../config/configuration';
import {
  InitializeInput,
  InitializeResult,
  PaymentProvider,
  WebhookEvent,
} from './payment-gateway';

/** Flutterwave standard checkout + webhook (verif-hash header match). */
@Injectable()
export class FlutterwaveProvider implements PaymentProvider {
  readonly method = PaymentMethod.FLUTTERWAVE;
  private readonly logger = new Logger(FlutterwaveProvider.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get secret() {
    return this.config.get('FLUTTERWAVE_SECRET_KEY', { infer: true });
  }
  private get hash() {
    return this.config.get('FLUTTERWAVE_SECRET_HASH', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.secret);
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      // Flutterwave expects major units for `amount`.
      const res = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: input.reference,
          amount: toMajorUnits(input.amount, input.currency),
          currency: input.currency,
          redirect_url: input.redirectUrl,
          customer: { email: input.email },
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as { status?: string; data?: { link: string } };
      if (!res.ok || !json.data?.link) {
        throw new Error(`Flutterwave initialize failed (${res.status})`);
      }
      return { authorizationUrl: json.data.link, reference: input.reference };
    } catch (e) {
      this.logger.error(`Flutterwave initialize error: ${e}`);
      throw new Error('Could not start Flutterwave payment');
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyAndParse(
    rawBody: Buffer | undefined,
    headers: Record<string, unknown>,
  ): WebhookEvent {
    const provided = headers['verif-hash'] as string | undefined;
    if (!this.hash || !rawBody || provided !== this.hash) {
      if (this.hash) this.logger.warn('Flutterwave webhook hash mismatch');
      return { ok: false, success: false, method: this.method };
    }
    try {
      const payload = JSON.parse(rawBody.toString()) as {
        event?: string;
        data?: { tx_ref: string; amount: number; currency: string; status: string };
      };
      const data = payload.data;
      return {
        ok: true,
        success: data?.status === 'successful',
        reference: data?.tx_ref,
        amount: data ? toMinorUnits(data.amount, data.currency) : undefined,
        currency: data?.currency,
        method: this.method,
      };
    } catch {
      this.logger.warn('Flutterwave webhook body not valid JSON');
      return { ok: false, success: false, method: this.method };
    }
  }
}
