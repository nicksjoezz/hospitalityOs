"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markInvoicePaidSchema = exports.updatePlatformSettingsSchema = exports.extendTrialSchema = exports.setFeatureOverridesSchema = exports.setHotelPlanSchema = exports.suspendHotelSchema = exports.approveHotelSchema = exports.updatePlanSchema = exports.planSchema = exports.createPlatformAdminSchema = exports.platformLoginSchema = exports.registerHotelSchema = exports.roleSchema = exports.syncBatchSchema = exports.syncOperationSchema = exports.recordPaymentSchema = exports.checkInSchema = exports.cancelReservationSchema = exports.modifyReservationSchema = exports.createReservationSchema = exports.quoteSchema = exports.availabilitySchema = exports.guestInputSchema = exports.optionalEmail = exports.refreshSchema = exports.loginSchema = exports.isoDate = exports.money = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
/** Money is always integer minor units (kobo). Never floats. */
exports.money = zod_1.z.number().int().nonnegative();
/** A calendar date (YYYY-MM-DD) or full ISO datetime; coerced to Date. */
exports.isoDate = zod_1.z
    .union([zod_1.z.string(), zod_1.z.date()])
    .transform((v, ctx) => {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Invalid date' });
        return zod_1.z.NEVER;
    }
    return d;
});
// Preserves the literal union type (e.g. ReservationSource) rather than widening
// to `string`, so parsed DTO values stay assignable to the Prisma enums.
const enumOf = (e) => zod_1.z.nativeEnum(e);
// ---- Auth ----
exports.loginSchema = zod_1.z.object({
    phone: zod_1.z.string().min(3),
    password: zod_1.z.string().min(6),
    /** Optional tenant scope: which hotel this login belongs to (per-hotel login link). */
    hotelSlug: zod_1.z.string().min(1).max(60).optional(),
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10),
});
exports.optionalEmail = zod_1.z
    .string()
    .trim()
    .email()
    .optional()
    .or(zod_1.z.literal(''))
    .transform((v) => (v ? v : undefined));
// ---- Guest ----
exports.guestInputSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    phone: zod_1.z.string().min(3),
    email: exports.optionalEmail,
    whatsappId: zod_1.z.string().optional(),
    idType: zod_1.z.string().optional(),
    idNumber: zod_1.z.string().optional(),
    vip: zod_1.z.boolean().optional(),
    notes: zod_1.z.string().optional(),
});
// ---- Availability / quote ----
exports.availabilitySchema = zod_1.z
    .object({
    roomTypeId: zod_1.z.string().uuid().optional(),
    checkIn: exports.isoDate,
    checkOut: exports.isoDate,
})
    .refine((v) => v.checkOut > v.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
});
exports.quoteSchema = zod_1.z
    .object({
    roomTypeId: zod_1.z.string().uuid(),
    checkIn: exports.isoDate,
    checkOut: exports.isoDate,
})
    .refine((v) => v.checkOut > v.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
});
// ---- Reservation ----
exports.createReservationSchema = zod_1.z
    .object({
    guest: exports.guestInputSchema,
    roomTypeId: zod_1.z.string().uuid(),
    ratePlanId: zod_1.z.string().uuid().optional(),
    roomId: zod_1.z.string().uuid().optional(),
    checkIn: exports.isoDate,
    checkOut: exports.isoDate,
    adults: zod_1.z.number().int().positive().default(1),
    children: zod_1.z.number().int().nonnegative().default(0),
    source: enumOf(enums_1.ReservationSource).default(enums_1.ReservationSource.WALK_IN),
    specialRequests: zod_1.z.string().optional(),
    /** Provided by caller or the Idempotency-Key header to make creation safe to retry. */
    idempotencyKey: zod_1.z.string().min(8).optional(),
})
    .refine((v) => v.checkOut > v.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
});
exports.modifyReservationSchema = zod_1.z.object({
    checkIn: exports.isoDate.optional(),
    checkOut: exports.isoDate.optional(),
    roomTypeId: zod_1.z.string().uuid().optional(),
    roomId: zod_1.z.string().uuid().optional(),
    adults: zod_1.z.number().int().positive().optional(),
    children: zod_1.z.number().int().nonnegative().optional(),
    specialRequests: zod_1.z.string().optional(),
});
exports.cancelReservationSchema = zod_1.z.object({
    reason: zod_1.z.string().min(1),
});
exports.checkInSchema = zod_1.z.object({
    roomId: zod_1.z.string().uuid().optional(),
    depositAmount: exports.money.optional(),
    depositMethod: enumOf(enums_1.PaymentMethod).optional(),
});
// ---- Payment ----
exports.recordPaymentSchema = zod_1.z.object({
    amount: exports.money.refine((n) => n > 0, 'amount must be positive'),
    method: enumOf(enums_1.PaymentMethod),
    type: enumOf(enums_1.PaymentType),
    /**
     * Currency the guest paid in (ISO 4217). Omit to use the hotel base currency.
     * If different from the hotel base currency, `fxRate` is required.
     */
    currency: zod_1.z
        .string()
        .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code')
        .optional(),
    /** Major-unit rate: base-currency units per 1 unit of `currency`. Required for foreign currency. */
    fxRate: zod_1.z.number().positive().optional(),
    reference: zod_1.z.string().optional(),
    idempotencyKey: zod_1.z.string().min(8).optional(),
});
// ---- Offline sync ----
exports.syncOperationSchema = zod_1.z.object({
    idempotencyKey: zod_1.z.string().min(8),
    method: zod_1.z.enum(['POST', 'PATCH', 'PUT', 'DELETE']),
    path: zod_1.z.string().min(1),
    body: zod_1.z.unknown().optional(),
    /** client timestamp (ms) when the op was enqueued offline */
    enqueuedAt: zod_1.z.number().int(),
});
exports.syncBatchSchema = zod_1.z.object({
    operations: zod_1.z.array(exports.syncOperationSchema).max(200),
});
exports.roleSchema = enumOf(enums_1.Role);
// ===========================================================================
// Platform / multi-tenant SaaS layer (Phase 9)
// ===========================================================================
const featureKey = enumOf(enums_1.Feature);
const phoneStr = zod_1.z.string().min(3).max(32);
/** Public hotel self-registration → creates a TRIAL hotel + its OWNER login. */
exports.registerHotelSchema = zod_1.z.object({
    hotelName: zod_1.z.string().min(2).max(120),
    currency: zod_1.z
        .string()
        .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code')
        .default('NGN'),
    timezone: zod_1.z.string().min(1).default('Africa/Lagos'),
    ownerName: zod_1.z.string().min(2).max(120),
    ownerPhone: phoneStr,
    ownerEmail: exports.optionalEmail,
    ownerPassword: zod_1.z.string().min(8).max(128),
    /** Optional desired plan code (still starts as TRIAL until approved). */
    planCode: zod_1.z.string().min(2).max(40).optional(),
});
/** Platform-admin (master controller) login — by email, not phone. */
exports.platformLoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
exports.createPlatformAdminSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(2).max(120),
    password: zod_1.z.string().min(10).max(128),
    superAdmin: zod_1.z.boolean().default(false),
});
/** Create / edit a subscription plan (platform-admin). */
exports.planSchema = zod_1.z.object({
    code: zod_1.z
        .string()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9_-]+$/, 'code must be lowercase alphanumeric/-/_'),
    name: zod_1.z.string().min(2).max(80),
    description: zod_1.z.string().max(400).optional(),
    priceMinor: exports.money.default(0),
    currency: zod_1.z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default('USD'),
    interval: enumOf(enums_1.PlanInterval).default(enums_1.PlanInterval.MONTHLY),
    features: zod_1.z.array(featureKey).default([]),
    maxRooms: zod_1.z.number().int().positive().nullable().optional(),
    maxUsers: zod_1.z.number().int().positive().nullable().optional(),
    isPublic: zod_1.z.boolean().default(true),
    active: zod_1.z.boolean().default(true),
    sortOrder: zod_1.z.number().int().default(0),
});
exports.updatePlanSchema = exports.planSchema.partial().omit({ code: true });
/** Platform-admin: approve a trial hotel (optionally onto a specific plan). */
exports.approveHotelSchema = zod_1.z.object({
    planId: zod_1.z.string().uuid().optional(),
});
exports.suspendHotelSchema = zod_1.z.object({
    reason: zod_1.z.string().min(1).max(400),
});
exports.setHotelPlanSchema = zod_1.z.object({
    planId: zod_1.z.string().uuid(),
});
exports.setFeatureOverridesSchema = zod_1.z.object({
    /** Map of feature → on/off. Omitting a feature falls back to the plan default. */
    overrides: zod_1.z.record(featureKey, zod_1.z.boolean()),
});
exports.extendTrialSchema = zod_1.z.object({
    days: zod_1.z.number().int().positive().max(365),
});
// ---- Platform settings (master, Phase 10) ----
exports.updatePlatformSettingsSchema = zod_1.z.object({
    platformName: zod_1.z.string().min(1).max(80).optional(),
    supportEmail: zod_1.z.string().email().nullable().optional(),
    signupEnabled: zod_1.z.boolean().optional(),
    trialDays: zod_1.z.number().int().positive().max(365).optional(),
    defaultPlanCode: zod_1.z.string().min(2).max(40).nullable().optional(),
    billingCurrency: zod_1.z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
    gracePeriodDays: zod_1.z.number().int().nonnegative().max(90).optional(),
    // Master's own gateway for collecting subscription fees. Secret keys are
    // write-only (never returned); send a new value to rotate, omit to keep.
    paymentProvider: enumOf(enums_1.PlatformPaymentProvider).nullable().optional(),
    paymentPublicKey: zod_1.z.string().max(200).nullable().optional(),
    paymentSecretKey: zod_1.z.string().max(200).nullable().optional(),
});
// ---- Subscription billing (master, Phase 10) ----
exports.markInvoicePaidSchema = zod_1.z.object({
    reference: zod_1.z.string().max(120).optional(),
    note: zod_1.z.string().max(400).optional(),
});
