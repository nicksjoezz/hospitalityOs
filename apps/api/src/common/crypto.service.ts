import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppConfig } from '../config/configuration';

const PREFIX = 'enc:v1:';

/**
 * Field-level encryption of PII at rest (plan.md §14) — guest ID numbers and the
 * reporter identity behind anonymous staff reports. AES-256-GCM. If no key is
 * configured (dev), values pass through unencrypted and a warning is logged, so
 * the system still runs; production must set APP_ENCRYPTION_KEY.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService<AppConfig, true>) {
    const raw = config.get('APP_ENCRYPTION_KEY', { infer: true });
    this.key = raw ? this.deriveKey(raw) : null;
    if (!this.key) {
      this.logger.warn('APP_ENCRYPTION_KEY not set — PII stored unencrypted (dev only).');
    }
  }

  private deriveKey(raw: string): Buffer {
    // Accept a 32-byte hex/base64 key, else derive deterministically via SHA-256.
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    try {
      const b = Buffer.from(raw, 'base64');
      if (b.length === 32) return b;
    } catch {
      /* fall through */
    }
    return crypto.createHash('sha256').update(raw).digest();
  }

  /** Encrypt a string; returns a prefixed token. No-op (passthrough) without a key. */
  encrypt(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return plain ?? null;
    if (!this.key) return plain;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
  }

  /** Decrypt a token produced by {@link encrypt}. Plaintext/legacy values pass through. */
  decrypt(value: string | null | undefined): string | null {
    if (!value) return value ?? null;
    if (!value.startsWith(PREFIX)) return value; // legacy plaintext
    if (!this.key) return value;
    try {
      const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const ct = buf.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch (e) {
      this.logger.error(`Failed to decrypt value: ${e}`);
      return null;
    }
  }
}
