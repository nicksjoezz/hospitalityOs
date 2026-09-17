import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { WhatsAppCloudAdapter } from './whatsapp.adapter';
import { AppConfig } from '../config/configuration';

function adapterWith(values: Record<string, string>): WhatsAppCloudAdapter {
  const config = {
    get: (key: string) => values[key] ?? '',
  } as unknown as ConfigService<AppConfig, true>;
  return new WhatsAppCloudAdapter(config);
}

describe('WhatsAppCloudAdapter', () => {
  const secret = 'test-app-secret';
  const adapter = adapterWith({
    WHATSAPP_APP_SECRET: secret,
    WHATSAPP_VERIFY_TOKEN: 'verify-123',
  });

  it('verifies the subscription handshake', () => {
    expect(adapter.verifySubscription('subscribe', 'verify-123', 'CHAL')).toBe('CHAL');
    expect(adapter.verifySubscription('subscribe', 'wrong', 'CHAL')).toBeNull();
  });

  it('validates a correct HMAC signature and rejects a bad one', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const good =
      'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(adapter.verifySignature(body, good)).toBe(true);
    expect(adapter.verifySignature(body, 'sha256=deadbeef')).toBe(false);
    expect(adapter.verifySignature(body, undefined)).toBe(false);
  });

  it('skips signature verification when no app secret is configured (dev)', () => {
    const dev = adapterWith({});
    expect(dev.verifySignature(undefined, undefined)).toBe(true);
  });

  it('parses text messages out of a webhook payload', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Ada' } }],
                messages: [
                  { id: 'wamid.1', from: '2347000', type: 'text', text: { body: 'Hi' } },
                  { id: 'wamid.2', from: '2347000', type: 'image' },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = adapter.parseWebhook(payload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      messageId: 'wamid.1',
      from: '2347000',
      text: 'Hi',
      senderName: 'Ada',
    });
  });
});
