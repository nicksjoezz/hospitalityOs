import { z } from 'zod';
import {
  Feature,
  PaymentMethod,
  PaymentType,
  PlanInterval,
  PlatformPaymentProvider,
  ReservationSource,
  Role,
} from './enums';

/** Money is always integer minor units (kobo). Never floats. */
export const money = z.number().int().nonnegative();

/** A calendar date (YYYY-MM-DD) or full ISO datetime; coerced to Date. */
export const isoDate = z
  .union([z.string(), z.date()])
  .transform((v, ctx) => {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
      return z.NEVER;
    }
    return d;
  });

// Preserves the literal union type (e.g. ReservationSource) rather than widening
// to `string`, so parsed DTO values stay assignable to the Prisma enums.
const enumOf = <T extends Record<string, string>>(e: T) => z.nativeEnum(e);

// ---- Auth ----
export const loginSchema = z.object({
  phone: z.string().min(3),
  password: z.string().min(6),
  /** Optional tenant scope: which hotel this login belongs to (per-hotel login link). */
  hotelSlug: z.string().min(1).max(60).optional(),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const optionalEmail = z
  .string()
  .trim()
  .email()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

// ---- Guest ----
export const guestInputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: optionalEmail,
  whatsappId: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  vip: z.boolean().optional(),
  notes: z.string().optional(),
});
export type GuestInputDto = z.infer<typeof guestInputSchema>;

// ---- Availability / quote ----
export const availabilitySchema = z
  .object({
    roomTypeId: z.string().uuid().optional(),
    checkIn: isoDate,
    checkOut: isoDate,
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });
export type AvailabilityDto = z.infer<typeof availabilitySchema>;

export const quoteSchema = z
  .object({
    roomTypeId: z.string().uuid(),
    checkIn: isoDate,
    checkOut: isoDate,
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });
export type QuoteDto = z.infer<typeof quoteSchema>;

// ---- Reservation ----
export const createReservationSchema = z
  .object({
    guest: guestInputSchema,
    roomTypeId: z.string().uuid(),
    ratePlanId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.number().int().positive().default(1),
    children: z.number().int().nonnegative().default(0),
    source: enumOf(ReservationSource).default(ReservationSource.WALK_IN),
    specialRequests: z.string().optional(),
    /** Provided by caller or the Idempotency-Key header to make creation safe to retry. */
    idempotencyKey: z.string().min(8).optional(),
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });
export type CreateReservationDto = z.infer<typeof createReservationSchema>;

export const modifyReservationSchema = z.object({
  checkIn: isoDate.optional(),
  checkOut: isoDate.optional(),
  roomTypeId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  adults: z.number().int().positive().optional(),
  children: z.number().int().nonnegative().optional(),
  specialRequests: z.string().optional(),
});
export type ModifyReservationDto = z.infer<typeof modifyReservationSchema>;

export const cancelReservationSchema = z.object({
  reason: z.string().min(1),
});
export type CancelReservationDto = z.infer<typeof cancelReservationSchema>;

export const checkInSchema = z.object({
  roomId: z.string().uuid().optional(),
  depositAmount: money.optional(),
  depositMethod: enumOf(PaymentMethod).optional(),
});
export type CheckInDto = z.infer<typeof checkInSchema>;

// ---- Payment ----
export const recordPaymentSchema = z.object({
  amount: money.refine((n) => n > 0, 'amount must be positive'),
  method: enumOf(PaymentMethod),
  type: enumOf(PaymentType),
  /**
   * Currency the guest paid in (ISO 4217). Omit to use the hotel base currency.
   * If different from the hotel base currency, `fxRate` is required.
   */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code')
    .optional(),
  /** Major-unit rate: base-currency units per 1 unit of `currency`. Required for foreign currency. */
  fxRate: z.number().positive().optional(),
  reference: z.string().optional(),
  idempotencyKey: z.string().min(8).optional(),
});
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;

// ---- Offline sync ----
export const syncOperationSchema = z.object({
  idempotencyKey: z.string().min(8),
  method: z.enum(['POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().min(1),
  body: z.unknown().optional(),
  /** client timestamp (ms) when the op was enqueued offline */
  enqueuedAt: z.number().int(),
});
export type SyncOperationDto = z.infer<typeof syncOperationSchema>;

export const syncBatchSchema = z.object({
  operations: z.array(syncOperationSchema).max(200),
});
export type SyncBatchDto = z.infer<typeof syncBatchSchema>;

export const roleSchema = enumOf(Role);

// ===========================================================================
// Platform / multi-tenant SaaS layer (Phase 9)
// ===========================================================================
const featureKey = enumOf(Feature);
const phoneStr = z.string().min(3).max(32);

/** Public hotel self-registration → creates a TRIAL hotel + its OWNER login. */
export const registerHotelSchema = z.object({
  hotelName: z.string().min(2).max(120),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code')
    .default('NGN'),
  timezone: z.string().min(1).default('Africa/Lagos'),
  ownerName: z.string().min(2).max(120),
  ownerPhone: phoneStr,
  ownerEmail: optionalEmail,
  ownerPassword: z.string().min(8).max(128),
  /** Optional desired plan code (still starts as TRIAL until approved). */
  planCode: z.string().min(2).max(40).optional(),
});
export type RegisterHotelDto = z.infer<typeof registerHotelSchema>;

/** Platform-admin (master controller) login — by email, not phone. */
export const platformLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type PlatformLoginDto = z.infer<typeof platformLoginSchema>;

export const createPlatformAdminSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z.string().min(10).max(128),
  superAdmin: z.boolean().default(false),
});
export type CreatePlatformAdminDto = z.infer<typeof createPlatformAdminSchema>;

/** Create / edit a subscription plan (platform-admin). */
export const planSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, 'code must be lowercase alphanumeric/-/_'),
  name: z.string().min(2).max(80),
  description: z.string().max(400).optional(),
  priceMinor: money.default(0),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  interval: enumOf(PlanInterval).default(PlanInterval.MONTHLY),
  features: z.array(featureKey).default([]),
  maxRooms: z.number().int().positive().nullable().optional(),
  maxUsers: z.number().int().positive().nullable().optional(),
  isPublic: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type PlanDto = z.infer<typeof planSchema>;

export const updatePlanSchema = planSchema.partial().omit({ code: true });
export type UpdatePlanDto = z.infer<typeof updatePlanSchema>;

/** Platform-admin: approve a trial hotel (optionally onto a specific plan). */
export const approveHotelSchema = z.object({
  planId: z.string().uuid().optional(),
});
export type ApproveHotelDto = z.infer<typeof approveHotelSchema>;

export const suspendHotelSchema = z.object({
  reason: z.string().min(1).max(400),
});
export type SuspendHotelDto = z.infer<typeof suspendHotelSchema>;

export const setHotelPlanSchema = z.object({
  planId: z.string().uuid(),
});
export type SetHotelPlanDto = z.infer<typeof setHotelPlanSchema>;

export const setFeatureOverridesSchema = z.object({
  /** Map of feature → on/off. Omitting a feature falls back to the plan default. */
  overrides: z.record(featureKey, z.boolean()),
});
export type SetFeatureOverridesDto = z.infer<typeof setFeatureOverridesSchema>;

export const extendTrialSchema = z.object({
  days: z.number().int().positive().max(365),
});
export type ExtendTrialDto = z.infer<typeof extendTrialSchema>;

// ---- Platform settings (master, Phase 10) ----
export const updatePlatformSettingsSchema = z.object({
  platformName: z.string().min(1).max(80).optional(),
  supportEmail: z.string().email().nullable().optional(),
  signupEnabled: z.boolean().optional(),
  trialDays: z.number().int().positive().max(365).optional(),
  defaultPlanCode: z.string().min(2).max(40).nullable().optional(),
  billingCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  gracePeriodDays: z.number().int().nonnegative().max(90).optional(),
  // Master's own gateway for collecting subscription fees. Secret keys are
  // write-only (never returned); send a new value to rotate, omit to keep.
  paymentProvider: enumOf(PlatformPaymentProvider).nullable().optional(),
  paymentPublicKey: z.string().max(200).nullable().optional(),
  paymentSecretKey: z.string().max(200).nullable().optional(),
});
export type UpdatePlatformSettingsDto = z.infer<typeof updatePlatformSettingsSchema>;

// ---- Subscription billing (master, Phase 10) ----
export const markInvoicePaidSchema = z.object({
  reference: z.string().max(120).optional(),
  note: z.string().max(400).optional(),
});
export type MarkInvoicePaidDto = z.infer<typeof markInvoicePaidSchema>;
