import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppConfig } from '../config/configuration';
import {
  ChannelAdapter,
  OutboundResult,
  ParsedInbound,
} from './channel-adapter';

const GRAPH_VERSION = 'v20.0';

/**
 * Meta WhatsApp Cloud API adapter (plan.md §8). Verifies webhooks, parses
 * inbound messages, and sends outbound text/templates. Degrades gracefully when
 * credentials are absent (logs instead of sending) so the rest of the system
 * works in development.
 */
@Injectable()
export class WhatsAppCloudAdapter implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppCloudAdapter.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get phoneNumberId() {
    return this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true });
  }
  private get accessToken() {
    return this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true });
  }
  private get appSecret() {
    return this.config.get('WHATSAPP_APP_SECRET', { infer: true });
  }
  private get verifyToken() {
    return this.config.get('WHATSAPP_VERIFY_TOKEN', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  /** GET webhook verification handshake. Returns the challenge if valid. */
  verifySubscription(mode?: string, token?: string, challenge?: string): string | null {
    if (mode === 'subscribe' && token && token === this.verifyToken) {
      return challenge ?? '';
    }
    return null;
  }

  /**
   * Verify the X-Hub-Signature-256 header against the raw body using the app
   * secret. If no app secret is configured (dev), verification is skipped.
   */
  verifySignature(rawBody: Buffer | undefined, signatureHeader?: string): boolean {
    if (!this.appSecret) return true; // dev: not configured
    if (!rawBody || !signatureHeader) return false;
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signatureHeader),
      );
    } catch {
      return false;
    }
  }

  /** Extract inbound text messages from a webhook payload. */
  parseWebhook(body: unknown): ParsedInbound[] {
    const out: ParsedInbound[] = [];
    const entries = (body as { entry?: unknown[] })?.entry ?? [];
    for (const entry of entries as Array<{ changes?: unknown[] }>) {
      for (const change of entry.changes ?? []) {
        const value = (change as { value?: any }).value;
        const messages = value?.messages ?? [];
        const contacts = value?.contacts ?? [];
        const name = contacts?.[0]?.profile?.name as string | undefined;
        const phoneNumberId = value?.metadata?.phone_number_id as string | undefined;
        for (const m of messages) {
          if (m.type === 'text' && m.text?.body) {
            out.push({
              messageId: m.id,
              from: m.from,
              text: m.text.body,
              senderName: name,
              phoneNumberId,
            });
          }
        }
      }
    }
    return out;
  }

  async sendText(to: string, body: string): Promise<OutboundResult> {
    return this.send(to, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: string[] = [],
  ): Promise<OutboundResult> {
    return this.send(to, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(params.length
          ? {
              components: [
                {
                  type: 'body',
                  parameters: params.map((p) => ({ type: 'text', text: p })),
                },
              ],
            }
          : {}),
      },
    });
  }

  private async send(to: string, payload: object): Promise<OutboundResult> {
    if (!this.isConfigured()) {
      this.logger.warn(`[dev] WhatsApp not configured; would send to ${to}`);
      return { ok: true, providerId: 'dev-noop' };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`WhatsApp send failed ${res.status}: ${text}`);
        return { ok: false, error: `status ${res.status}` };
      }
      const json = (await res.json()) as { messages?: Array<{ id: string }> };
      return { ok: true, providerId: json.messages?.[0]?.id };
    } catch (e) {
      this.logger.error(`WhatsApp send error: ${e}`);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
