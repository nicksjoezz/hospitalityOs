import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpdatePlatformSettingsDto } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { AppConfig } from '../config/configuration';

export interface PaymentConfig {
  provider: string;
  publicKey: string | null;
  secretKey: string;
}

/**
 * Global platform settings (single row). Seeded from env defaults on first read.
 * The gateway secret key is encrypted at rest and never returned to clients.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Get (or lazily create from env defaults) the singleton settings row.
   *  Env values may arrive as strings, so coerce them to the column types. */
  async get() {
    const existing = await this.prisma.platformSettings.findFirst();
    if (existing) return existing;
    const rawSignup = this.config.get('PUBLIC_SIGNUP_ENABLED', { infer: true }) as unknown;
    const signupEnabled =
      typeof rawSignup === 'boolean' ? rawSignup : String(rawSignup) !== 'false';
    const trialDays = Number(this.config.get('TRIAL_DAYS', { infer: true })) || 14;
    return this.prisma.platformSettings.create({
      data: {
        signupEnabled,
        trialDays,
        billingCurrency: this.config.get('DEFAULT_CURRENCY', { infer: true }) || 'USD',
      },
    });
  }

  /** Client-safe view: secret key replaced by a boolean flag. */
  async getSafe() {
    const s = await this.get();
    const { paymentSecretKeyEnc, ...rest } = s;
    return { ...rest, hasPaymentSecret: Boolean(paymentSecretKeyEnc) };
  }

  async update(dto: UpdatePlatformSettingsDto) {
    const current = await this.get();
    const data: Record<string, unknown> = {};
    for (const k of [
      'platformName',
      'supportEmail',
      'signupEnabled',
      'trialDays',
      'defaultPlanCode',
      'billingCurrency',
      'gracePeriodDays',
      'paymentProvider',
      'paymentPublicKey',
    ] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    // Secret key: rotate only when a non-empty value is sent; '' clears it.
    if (dto.paymentSecretKey !== undefined) {
      data.paymentSecretKeyEnc = dto.paymentSecretKey
        ? this.crypto.encrypt(dto.paymentSecretKey)
        : null;
    }
    await this.prisma.platformSettings.update({ where: { id: current.id }, data });
    return this.getSafe();
  }

  /** Decrypted gateway config for collecting subscription fees, or null if unset. */
  async paymentConfig(): Promise<PaymentConfig | null> {
    const s = await this.get();
    if (!s.paymentProvider || !s.paymentSecretKeyEnc) return null;
    const secretKey = this.crypto.decrypt(s.paymentSecretKeyEnc);
    if (!secretKey) return null;
    return { provider: s.paymentProvider, publicKey: s.paymentPublicKey, secretKey };
  }
}
