import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

export interface EmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Email channel via SendGrid (plan.md §4 — email adapter). Sends transactional
 * mail (booking confirmations, receipts) and marketing. Degrades to a logged
 * no-op when SENDGRID_API_KEY is unset, so the system runs in development.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get apiKey() {
    return this.config.get('SENDGRID_API_KEY', { infer: true });
  }
  private get from() {
    return this.config.get('EMAIL_FROM', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async send(to: string, subject: string, body: string): Promise<EmailResult> {
    if (!this.isConfigured()) {
      this.logger.warn(`[dev] Email not configured; would send "${subject}" to ${to}`);
      return { ok: true };
    }
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: this.from },
          subject,
          content: [{ type: 'text/plain', value: body }],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`SendGrid failed ${res.status}: ${text}`);
        return { ok: false, error: `status ${res.status}` };
      }
      return { ok: true };
    } catch (e) {
      this.logger.error(`SendGrid error: ${e}`);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
