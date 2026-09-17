import { z } from 'zod';

/** Validates process.env at boot; fail fast on misconfiguration (plan.md §16). */
const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is missing. Please link a PostgreSQL database in Railway!'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().default('NQz2VJ9S45OQwwrQR3FknGNC-eKcoQIlPtLEID-UCNONjpq2lqXUkDcnhWdW_N3R'),
  JWT_REFRESH_SECRET: z.string().default('rpRDBbyONIvuGcaK5L4aNE-n_IwgfzDVNeVTh1xuVg4VyjVYg3LNJyp77UqF6wGp'),
  JWT_ACCESS_TTL: z.string().default('900s'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL_CHEAP: z.string().default('claude-haiku-4-5-20251001'),
  ANTHROPIC_MODEL_BALANCED: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_MODEL_SMART: z.string().default('claude-opus-4-8'),

  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),

  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  FLUTTERWAVE_SECRET_KEY: z.string().optional().default(''),
  FLUTTERWAVE_SECRET_HASH: z.string().optional().default(''),

  DEFAULT_CURRENCY: z.string().default('NGN'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),

  // 32-byte key for encrypting PII at rest (hex/base64/passphrase).
  APP_ENCRYPTION_KEY: z.string().default('27dd7921d1603f3f57df895ba206935504db90824d404a79c24a3670cb5dec3b'),

  // Loyalty program
  LOYALTY_POINTS_PER_UNIT: z.coerce.number().default(1), // points per major currency unit spent
  LOYALTY_REDEEM_THRESHOLD: z.coerce.number().default(100), // min points to redeem
  LOYALTY_REDEEM_VALUE: z.coerce.number().default(1), // minor units credited per point redeemed

  // Email (SendGrid). Empty = dev no-op (logs instead of sending).
  SENDGRID_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('no-reply@hospitalityos.local'),
  PUBLIC_BOOKING_ENABLED: z.coerce.boolean().default(true),

  // Unconfirmed HELD bookings auto-release after this many minutes (frees inventory).
  HOLD_TTL_MINUTES: z.coerce.number().default(30),

  // ---- Production hardening ----
  // Comma-separated allowed web origins for CORS/WebSockets. '*' reflects any (dev only).
  CORS_ORIGINS: z.string().default('*'),
  // Per-IP rate limit: requests per window (seconds).
  THROTTLE_TTL: z.coerce.number().default(60),
  THROTTLE_LIMIT: z.coerce.number().default(300),
  // Serve the built web SPA from the API (single-domain deploy, e.g. Railway).
  SERVE_WEB: z.coerce.boolean().default(false),
  WEB_DIST: z.string().default(''),
  // Optional shared secret required on inbound OTA channel webhooks.
  CHANNEL_WEBHOOK_SECRET: z.string().optional().default(''),

  // Live FX rates (free, no key). Base url is suffixed with /{BASE_CURRENCY}.
  FX_API_URL: z.string().default('https://open.er-api.com/v6/latest'),
  FX_CACHE_TTL_MS: z.coerce.number().default(6 * 60 * 60 * 1000), // 6h

  // ---- Platform / multi-tenant SaaS (Phase 9) ----
  // Allow public hotel self-registration (creates a TRIAL tenant + owner login).
  PUBLIC_SIGNUP_ENABLED: z.coerce.boolean().default(true),
  // Free-trial length for self-registered hotels, in days.
  TRIAL_DAYS: z.coerce.number().default(14),
  // First-run master-controller (platform super-admin) seed credentials.
  PLATFORM_ADMIN_EMAIL: z.string().default('admin@hospitalityos.local'),
  PLATFORM_ADMIN_PASSWORD: z.string().default('ChangeMe_Master_2026!'),
  PLATFORM_ADMIN_NAME: z.string().default('Master Administrator'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      process.env.DATABASE_PUBLIC_URL ||
      process.env.DATABASE_PRIVATE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRESQL_URL ||
      '';
  }
  if (!process.env.REDIS_URL) {
    process.env.REDIS_URL =
      process.env.REDIS_PUBLIC_URL ||
      process.env.REDIS_PRIVATE_URL ||
      'redis://localhost:6379';
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
