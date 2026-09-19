import { z } from 'zod';
/** Money is always integer minor units (kobo). Never floats. */
export declare const money: z.ZodNumber;
/** A calendar date (YYYY-MM-DD) or full ISO datetime; coerced to Date. */
export declare const isoDate: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
export declare const loginSchema: z.ZodObject<{
    phone: z.ZodString;
    password: z.ZodString;
    /** Optional tenant scope: which hotel this login belongs to (per-hotel login link). */
    hotelSlug: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    password: string;
    hotelSlug?: string | undefined;
}, {
    phone: string;
    password: string;
    hotelSlug?: string | undefined;
}>;
export type LoginDto = z.infer<typeof loginSchema>;
export declare const refreshSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export type RefreshDto = z.infer<typeof refreshSchema>;
export declare const optionalEmail: z.ZodEffects<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>, string | undefined, string | undefined>;
export declare const guestInputSchema: z.ZodObject<{
    name: z.ZodString;
    phone: z.ZodString;
    email: z.ZodEffects<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>, string | undefined, string | undefined>;
    whatsappId: z.ZodOptional<z.ZodString>;
    idType: z.ZodOptional<z.ZodString>;
    idNumber: z.ZodOptional<z.ZodString>;
    vip: z.ZodOptional<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    phone: string;
    name: string;
    email?: string | undefined;
    whatsappId?: string | undefined;
    idType?: string | undefined;
    idNumber?: string | undefined;
    vip?: boolean | undefined;
    notes?: string | undefined;
}, {
    phone: string;
    name: string;
    email?: string | undefined;
    whatsappId?: string | undefined;
    idType?: string | undefined;
    idNumber?: string | undefined;
    vip?: boolean | undefined;
    notes?: string | undefined;
}>;
export type GuestInputDto = z.infer<typeof guestInputSchema>;
export declare const availabilitySchema: z.ZodEffects<z.ZodObject<{
    roomTypeId: z.ZodOptional<z.ZodString>;
    checkIn: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
    checkOut: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
}, "strip", z.ZodTypeAny, {
    checkIn: Date;
    checkOut: Date;
    roomTypeId?: string | undefined;
}, {
    checkIn: string | Date;
    checkOut: string | Date;
    roomTypeId?: string | undefined;
}>, {
    checkIn: Date;
    checkOut: Date;
    roomTypeId?: string | undefined;
}, {
    checkIn: string | Date;
    checkOut: string | Date;
    roomTypeId?: string | undefined;
}>;
export type AvailabilityDto = z.infer<typeof availabilitySchema>;
export declare const quoteSchema: z.ZodEffects<z.ZodObject<{
    roomTypeId: z.ZodString;
    checkIn: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
    checkOut: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
}, "strip", z.ZodTypeAny, {
    roomTypeId: string;
    checkIn: Date;
    checkOut: Date;
}, {
    roomTypeId: string;
    checkIn: string | Date;
    checkOut: string | Date;
}>, {
    roomTypeId: string;
    checkIn: Date;
    checkOut: Date;
}, {
    roomTypeId: string;
    checkIn: string | Date;
    checkOut: string | Date;
}>;
export type QuoteDto = z.infer<typeof quoteSchema>;
export declare const createReservationSchema: z.ZodEffects<z.ZodObject<{
    guest: z.ZodObject<{
        name: z.ZodString;
        phone: z.ZodString;
        email: z.ZodEffects<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>, string | undefined, string | undefined>;
        whatsappId: z.ZodOptional<z.ZodString>;
        idType: z.ZodOptional<z.ZodString>;
        idNumber: z.ZodOptional<z.ZodString>;
        vip: z.ZodOptional<z.ZodBoolean>;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        phone: string;
        name: string;
        email?: string | undefined;
        whatsappId?: string | undefined;
        idType?: string | undefined;
        idNumber?: string | undefined;
        vip?: boolean | undefined;
        notes?: string | undefined;
    }, {
        phone: string;
        name: string;
        email?: string | undefined;
        whatsappId?: string | undefined;
        idType?: string | undefined;
        idNumber?: string | undefined;
        vip?: boolean | undefined;
        notes?: string | undefined;
    }>;
    roomTypeId: z.ZodString;
    ratePlanId: z.ZodOptional<z.ZodString>;
    roomId: z.ZodOptional<z.ZodString>;
    checkIn: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
    checkOut: z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>;
    adults: z.ZodDefault<z.ZodNumber>;
    children: z.ZodDefault<z.ZodNumber>;
    source: z.ZodDefault<z.ZodNativeEnum<{
        readonly WHATSAPP: "WHATSAPP";
        readonly WALK_IN: "WALK_IN";
        readonly PHONE: "PHONE";
        readonly OTA: "OTA";
        readonly WEBSITE: "WEBSITE";
        readonly CORPORATE: "CORPORATE";
    }>>;
    specialRequests: z.ZodOptional<z.ZodString>;
    /** Provided by caller or the Idempotency-Key header to make creation safe to retry. */
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    roomTypeId: string;
    checkIn: Date;
    checkOut: Date;
    guest: {
        phone: string;
        name: string;
        email?: string | undefined;
        whatsappId?: string | undefined;
        idType?: string | undefined;
        idNumber?: string | undefined;
        vip?: boolean | undefined;
        notes?: string | undefined;
    };
    adults: number;
    children: number;
    source: "WHATSAPP" | "WALK_IN" | "PHONE" | "OTA" | "WEBSITE" | "CORPORATE";
    ratePlanId?: string | undefined;
    roomId?: string | undefined;
    specialRequests?: string | undefined;
    idempotencyKey?: string | undefined;
}, {
    roomTypeId: string;
    checkIn: string | Date;
    checkOut: string | Date;
    guest: {
        phone: string;
        name: string;
        email?: string | undefined;
        whatsappId?: string | undefined;
        idType?: string | undefined;
        idNumber?: string | undefined;
        vip?: boolean | undefined;
        notes?: string | undefined;
    };
    ratePlanId?: string | undefined;
    roomId?: string | undefined;
    adults?: number | undefined;
    children?: number | undefined;
    source?: "WHATSAPP" | "WALK_IN" | "PHONE" | "OTA" | "WEBSITE" | "CORPORATE" | undefined;
    specialRequests?: string | undefined;
    idempotencyKey?: string | undefined;
}>, {
    roomTypeId: string;
    checkIn: Date;
    checkOut: Date;
    guest: {
        phone: string;
        name: string;
        email?: string | undefined;
        whatsappId?: string | undefined;
        idType?: string | undefined;
        idNumber?: string | undefined;
        vip?: boolean | undefined;
        notes?: string | undefined;
    };
    adults: number;
    children: number;
    source: "WHATSAPP" | "WALK_IN" | "PHONE" | "OTA" | "WEBSITE" | "CORPORATE";
    ratePlanId?: string | undefined;
    roomId?: string | undefined;
    specialRequests?: string | undefined;
    idempotencyKey?: string | undefined;
}, {
    roomTypeId: string;
    checkIn: string | Date;
    checkOut: string | Date;
    guest: {
        phone: string;
        name: string;
        email?: string | undefined;
        whatsappId?: string | undefined;
        idType?: string | undefined;
        idNumber?: string | undefined;
        vip?: boolean | undefined;
        notes?: string | undefined;
    };
    ratePlanId?: string | undefined;
    roomId?: string | undefined;
    adults?: number | undefined;
    children?: number | undefined;
    source?: "WHATSAPP" | "WALK_IN" | "PHONE" | "OTA" | "WEBSITE" | "CORPORATE" | undefined;
    specialRequests?: string | undefined;
    idempotencyKey?: string | undefined;
}>;
export type CreateReservationDto = z.infer<typeof createReservationSchema>;
export declare const modifyReservationSchema: z.ZodObject<{
    checkIn: z.ZodOptional<z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>>;
    checkOut: z.ZodOptional<z.ZodEffects<z.ZodUnion<[z.ZodString, z.ZodDate]>, Date, string | Date>>;
    roomTypeId: z.ZodOptional<z.ZodString>;
    roomId: z.ZodOptional<z.ZodString>;
    adults: z.ZodOptional<z.ZodNumber>;
    children: z.ZodOptional<z.ZodNumber>;
    specialRequests: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    roomTypeId?: string | undefined;
    checkIn?: Date | undefined;
    checkOut?: Date | undefined;
    roomId?: string | undefined;
    adults?: number | undefined;
    children?: number | undefined;
    specialRequests?: string | undefined;
}, {
    roomTypeId?: string | undefined;
    checkIn?: string | Date | undefined;
    checkOut?: string | Date | undefined;
    roomId?: string | undefined;
    adults?: number | undefined;
    children?: number | undefined;
    specialRequests?: string | undefined;
}>;
export type ModifyReservationDto = z.infer<typeof modifyReservationSchema>;
export declare const cancelReservationSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export type CancelReservationDto = z.infer<typeof cancelReservationSchema>;
export declare const checkInSchema: z.ZodObject<{
    roomId: z.ZodOptional<z.ZodString>;
    depositAmount: z.ZodOptional<z.ZodNumber>;
    depositMethod: z.ZodOptional<z.ZodNativeEnum<{
        readonly CASH: "CASH";
        readonly TRANSFER: "TRANSFER";
        readonly CARD: "CARD";
        readonly POS: "POS";
        readonly PAYSTACK: "PAYSTACK";
        readonly FLUTTERWAVE: "FLUTTERWAVE";
    }>>;
}, "strip", z.ZodTypeAny, {
    roomId?: string | undefined;
    depositAmount?: number | undefined;
    depositMethod?: "CASH" | "TRANSFER" | "CARD" | "POS" | "PAYSTACK" | "FLUTTERWAVE" | undefined;
}, {
    roomId?: string | undefined;
    depositAmount?: number | undefined;
    depositMethod?: "CASH" | "TRANSFER" | "CARD" | "POS" | "PAYSTACK" | "FLUTTERWAVE" | undefined;
}>;
export type CheckInDto = z.infer<typeof checkInSchema>;
export declare const recordPaymentSchema: z.ZodObject<{
    amount: z.ZodEffects<z.ZodNumber, number, number>;
    method: z.ZodNativeEnum<{
        readonly CASH: "CASH";
        readonly TRANSFER: "TRANSFER";
        readonly CARD: "CARD";
        readonly POS: "POS";
        readonly PAYSTACK: "PAYSTACK";
        readonly FLUTTERWAVE: "FLUTTERWAVE";
    }>;
    type: z.ZodNativeEnum<{
        readonly DEPOSIT: "DEPOSIT";
        readonly BALANCE: "BALANCE";
        readonly FULL: "FULL";
        readonly REFUND: "REFUND";
    }>;
    /**
     * Currency the guest paid in (ISO 4217). Omit to use the hotel base currency.
     * If different from the hotel base currency, `fxRate` is required.
     */
    currency: z.ZodOptional<z.ZodString>;
    /** Major-unit rate: base-currency units per 1 unit of `currency`. Required for foreign currency. */
    fxRate: z.ZodOptional<z.ZodNumber>;
    reference: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "DEPOSIT" | "BALANCE" | "FULL" | "REFUND";
    amount: number;
    method: "CASH" | "TRANSFER" | "CARD" | "POS" | "PAYSTACK" | "FLUTTERWAVE";
    idempotencyKey?: string | undefined;
    currency?: string | undefined;
    fxRate?: number | undefined;
    reference?: string | undefined;
}, {
    type: "DEPOSIT" | "BALANCE" | "FULL" | "REFUND";
    amount: number;
    method: "CASH" | "TRANSFER" | "CARD" | "POS" | "PAYSTACK" | "FLUTTERWAVE";
    idempotencyKey?: string | undefined;
    currency?: string | undefined;
    fxRate?: number | undefined;
    reference?: string | undefined;
}>;
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;
export declare const syncOperationSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    method: z.ZodEnum<["POST", "PATCH", "PUT", "DELETE"]>;
    path: z.ZodString;
    body: z.ZodOptional<z.ZodUnknown>;
    /** client timestamp (ms) when the op was enqueued offline */
    enqueuedAt: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    path: string;
    idempotencyKey: string;
    method: "POST" | "PATCH" | "PUT" | "DELETE";
    enqueuedAt: number;
    body?: unknown;
}, {
    path: string;
    idempotencyKey: string;
    method: "POST" | "PATCH" | "PUT" | "DELETE";
    enqueuedAt: number;
    body?: unknown;
}>;
export type SyncOperationDto = z.infer<typeof syncOperationSchema>;
export declare const syncBatchSchema: z.ZodObject<{
    operations: z.ZodArray<z.ZodObject<{
        idempotencyKey: z.ZodString;
        method: z.ZodEnum<["POST", "PATCH", "PUT", "DELETE"]>;
        path: z.ZodString;
        body: z.ZodOptional<z.ZodUnknown>;
        /** client timestamp (ms) when the op was enqueued offline */
        enqueuedAt: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        path: string;
        idempotencyKey: string;
        method: "POST" | "PATCH" | "PUT" | "DELETE";
        enqueuedAt: number;
        body?: unknown;
    }, {
        path: string;
        idempotencyKey: string;
        method: "POST" | "PATCH" | "PUT" | "DELETE";
        enqueuedAt: number;
        body?: unknown;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    operations: {
        path: string;
        idempotencyKey: string;
        method: "POST" | "PATCH" | "PUT" | "DELETE";
        enqueuedAt: number;
        body?: unknown;
    }[];
}, {
    operations: {
        path: string;
        idempotencyKey: string;
        method: "POST" | "PATCH" | "PUT" | "DELETE";
        enqueuedAt: number;
        body?: unknown;
    }[];
}>;
export type SyncBatchDto = z.infer<typeof syncBatchSchema>;
export declare const roleSchema: z.ZodNativeEnum<{
    readonly OWNER: "OWNER";
    readonly MANAGER: "MANAGER";
    readonly FRONT_DESK: "FRONT_DESK";
    readonly HOUSEKEEPING: "HOUSEKEEPING";
    readonly MAINTENANCE: "MAINTENANCE";
    readonly KITCHEN: "KITCHEN";
    readonly BAR: "BAR";
    readonly PROCUREMENT: "PROCUREMENT";
    readonly SECURITY: "SECURITY";
    readonly ACCOUNTANT: "ACCOUNTANT";
}>;
/** Public hotel self-registration → creates a TRIAL hotel + its OWNER login. */
export declare const registerHotelSchema: z.ZodObject<{
    hotelName: z.ZodString;
    currency: z.ZodDefault<z.ZodString>;
    timezone: z.ZodDefault<z.ZodString>;
    ownerName: z.ZodString;
    ownerPhone: z.ZodString;
    ownerEmail: z.ZodEffects<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>, string | undefined, string | undefined>;
    ownerPassword: z.ZodString;
    /** Optional desired plan code (still starts as TRIAL until approved). */
    planCode: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    currency: string;
    hotelName: string;
    timezone: string;
    ownerName: string;
    ownerPhone: string;
    ownerPassword: string;
    ownerEmail?: string | undefined;
    planCode?: string | undefined;
}, {
    hotelName: string;
    ownerName: string;
    ownerPhone: string;
    ownerPassword: string;
    currency?: string | undefined;
    timezone?: string | undefined;
    ownerEmail?: string | undefined;
    planCode?: string | undefined;
}>;
export type RegisterHotelDto = z.infer<typeof registerHotelSchema>;
/** Platform-admin (master controller) login — by email, not phone. */
export declare const platformLoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    email: string;
}, {
    password: string;
    email: string;
}>;
export type PlatformLoginDto = z.infer<typeof platformLoginSchema>;
export declare const createPlatformAdminSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
    superAdmin: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    password: string;
    name: string;
    email: string;
    superAdmin: boolean;
}, {
    password: string;
    name: string;
    email: string;
    superAdmin?: boolean | undefined;
}>;
export type CreatePlatformAdminDto = z.infer<typeof createPlatformAdminSchema>;
/** Create / edit a subscription plan (platform-admin). */
export declare const planSchema: z.ZodObject<{
    code: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priceMinor: z.ZodDefault<z.ZodNumber>;
    currency: z.ZodDefault<z.ZodString>;
    interval: z.ZodDefault<z.ZodNativeEnum<{
        readonly MONTHLY: "MONTHLY";
        readonly QUARTERLY: "QUARTERLY";
        readonly YEARLY: "YEARLY";
    }>>;
    features: z.ZodDefault<z.ZodArray<z.ZodNativeEnum<{
        readonly RESERVATIONS: "RESERVATIONS";
        readonly HOUSEKEEPING: "HOUSEKEEPING";
        readonly MAINTENANCE: "MAINTENANCE";
        readonly STAFF: "STAFF";
        readonly RESTAURANT_POS: "RESTAURANT_POS";
        readonly BAR_POS: "BAR_POS";
        readonly INVENTORY: "INVENTORY";
        readonly PROCUREMENT: "PROCUREMENT";
        readonly RATE_MANAGEMENT: "RATE_MANAGEMENT";
        readonly CHANNEL_MANAGER: "CHANNEL_MANAGER";
        readonly ONLINE_PAYMENTS: "ONLINE_PAYMENTS";
        readonly BILLING_INVOICES: "BILLING_INVOICES";
        readonly AI_ASSISTANT: "AI_ASSISTANT";
        readonly AI_REVENUE: "AI_REVENUE";
        readonly ANALYTICS: "ANALYTICS";
        readonly MARKETING: "MARKETING";
        readonly LOYALTY: "LOYALTY";
        readonly GUEST_PORTAL: "GUEST_PORTAL";
        readonly REVIEWS: "REVIEWS";
        readonly SECURITY_REPORTS: "SECURITY_REPORTS";
    }>, "many">>;
    maxRooms: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    maxUsers: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    isPublic: z.ZodDefault<z.ZodBoolean>;
    active: z.ZodDefault<z.ZodBoolean>;
    sortOrder: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    code: string;
    name: string;
    currency: string;
    priceMinor: number;
    interval: "MONTHLY" | "QUARTERLY" | "YEARLY";
    features: ("HOUSEKEEPING" | "MAINTENANCE" | "PROCUREMENT" | "STAFF" | "RESERVATIONS" | "RESTAURANT_POS" | "BAR_POS" | "INVENTORY" | "RATE_MANAGEMENT" | "CHANNEL_MANAGER" | "ONLINE_PAYMENTS" | "BILLING_INVOICES" | "AI_ASSISTANT" | "AI_REVENUE" | "ANALYTICS" | "MARKETING" | "LOYALTY" | "GUEST_PORTAL" | "REVIEWS" | "SECURITY_REPORTS")[];
    isPublic: boolean;
    active: boolean;
    sortOrder: number;
    description?: string | undefined;
    maxRooms?: number | null | undefined;
    maxUsers?: number | null | undefined;
}, {
    code: string;
    name: string;
    currency?: string | undefined;
    description?: string | undefined;
    priceMinor?: number | undefined;
    interval?: "MONTHLY" | "QUARTERLY" | "YEARLY" | undefined;
    features?: ("HOUSEKEEPING" | "MAINTENANCE" | "PROCUREMENT" | "STAFF" | "RESERVATIONS" | "RESTAURANT_POS" | "BAR_POS" | "INVENTORY" | "RATE_MANAGEMENT" | "CHANNEL_MANAGER" | "ONLINE_PAYMENTS" | "BILLING_INVOICES" | "AI_ASSISTANT" | "AI_REVENUE" | "ANALYTICS" | "MARKETING" | "LOYALTY" | "GUEST_PORTAL" | "REVIEWS" | "SECURITY_REPORTS")[] | undefined;
    maxRooms?: number | null | undefined;
    maxUsers?: number | null | undefined;
    isPublic?: boolean | undefined;
    active?: boolean | undefined;
    sortOrder?: number | undefined;
}>;
export type PlanDto = z.infer<typeof planSchema>;
export declare const updatePlanSchema: z.ZodObject<Omit<{
    code: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    priceMinor: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    interval: z.ZodOptional<z.ZodDefault<z.ZodNativeEnum<{
        readonly MONTHLY: "MONTHLY";
        readonly QUARTERLY: "QUARTERLY";
        readonly YEARLY: "YEARLY";
    }>>>;
    features: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodNativeEnum<{
        readonly RESERVATIONS: "RESERVATIONS";
        readonly HOUSEKEEPING: "HOUSEKEEPING";
        readonly MAINTENANCE: "MAINTENANCE";
        readonly STAFF: "STAFF";
        readonly RESTAURANT_POS: "RESTAURANT_POS";
        readonly BAR_POS: "BAR_POS";
        readonly INVENTORY: "INVENTORY";
        readonly PROCUREMENT: "PROCUREMENT";
        readonly RATE_MANAGEMENT: "RATE_MANAGEMENT";
        readonly CHANNEL_MANAGER: "CHANNEL_MANAGER";
        readonly ONLINE_PAYMENTS: "ONLINE_PAYMENTS";
        readonly BILLING_INVOICES: "BILLING_INVOICES";
        readonly AI_ASSISTANT: "AI_ASSISTANT";
        readonly AI_REVENUE: "AI_REVENUE";
        readonly ANALYTICS: "ANALYTICS";
        readonly MARKETING: "MARKETING";
        readonly LOYALTY: "LOYALTY";
        readonly GUEST_PORTAL: "GUEST_PORTAL";
        readonly REVIEWS: "REVIEWS";
        readonly SECURITY_REPORTS: "SECURITY_REPORTS";
    }>, "many">>>;
    maxRooms: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    maxUsers: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    isPublic: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    sortOrder: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
}, "code">, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    currency?: string | undefined;
    description?: string | undefined;
    priceMinor?: number | undefined;
    interval?: "MONTHLY" | "QUARTERLY" | "YEARLY" | undefined;
    features?: ("HOUSEKEEPING" | "MAINTENANCE" | "PROCUREMENT" | "STAFF" | "RESERVATIONS" | "RESTAURANT_POS" | "BAR_POS" | "INVENTORY" | "RATE_MANAGEMENT" | "CHANNEL_MANAGER" | "ONLINE_PAYMENTS" | "BILLING_INVOICES" | "AI_ASSISTANT" | "AI_REVENUE" | "ANALYTICS" | "MARKETING" | "LOYALTY" | "GUEST_PORTAL" | "REVIEWS" | "SECURITY_REPORTS")[] | undefined;
    maxRooms?: number | null | undefined;
    maxUsers?: number | null | undefined;
    isPublic?: boolean | undefined;
    active?: boolean | undefined;
    sortOrder?: number | undefined;
}, {
    name?: string | undefined;
    currency?: string | undefined;
    description?: string | undefined;
    priceMinor?: number | undefined;
    interval?: "MONTHLY" | "QUARTERLY" | "YEARLY" | undefined;
    features?: ("HOUSEKEEPING" | "MAINTENANCE" | "PROCUREMENT" | "STAFF" | "RESERVATIONS" | "RESTAURANT_POS" | "BAR_POS" | "INVENTORY" | "RATE_MANAGEMENT" | "CHANNEL_MANAGER" | "ONLINE_PAYMENTS" | "BILLING_INVOICES" | "AI_ASSISTANT" | "AI_REVENUE" | "ANALYTICS" | "MARKETING" | "LOYALTY" | "GUEST_PORTAL" | "REVIEWS" | "SECURITY_REPORTS")[] | undefined;
    maxRooms?: number | null | undefined;
    maxUsers?: number | null | undefined;
    isPublic?: boolean | undefined;
    active?: boolean | undefined;
    sortOrder?: number | undefined;
}>;
export type UpdatePlanDto = z.infer<typeof updatePlanSchema>;
/** Platform-admin: approve a trial hotel (optionally onto a specific plan). */
export declare const approveHotelSchema: z.ZodObject<{
    planId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    planId?: string | undefined;
}, {
    planId?: string | undefined;
}>;
export type ApproveHotelDto = z.infer<typeof approveHotelSchema>;
export declare const suspendHotelSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export type SuspendHotelDto = z.infer<typeof suspendHotelSchema>;
export declare const setHotelPlanSchema: z.ZodObject<{
    planId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    planId: string;
}, {
    planId: string;
}>;
export type SetHotelPlanDto = z.infer<typeof setHotelPlanSchema>;
export declare const setFeatureOverridesSchema: z.ZodObject<{
    /** Map of feature → on/off. Omitting a feature falls back to the plan default. */
    overrides: z.ZodRecord<z.ZodNativeEnum<{
        readonly RESERVATIONS: "RESERVATIONS";
        readonly HOUSEKEEPING: "HOUSEKEEPING";
        readonly MAINTENANCE: "MAINTENANCE";
        readonly STAFF: "STAFF";
        readonly RESTAURANT_POS: "RESTAURANT_POS";
        readonly BAR_POS: "BAR_POS";
        readonly INVENTORY: "INVENTORY";
        readonly PROCUREMENT: "PROCUREMENT";
        readonly RATE_MANAGEMENT: "RATE_MANAGEMENT";
        readonly CHANNEL_MANAGER: "CHANNEL_MANAGER";
        readonly ONLINE_PAYMENTS: "ONLINE_PAYMENTS";
        readonly BILLING_INVOICES: "BILLING_INVOICES";
        readonly AI_ASSISTANT: "AI_ASSISTANT";
        readonly AI_REVENUE: "AI_REVENUE";
        readonly ANALYTICS: "ANALYTICS";
        readonly MARKETING: "MARKETING";
        readonly LOYALTY: "LOYALTY";
        readonly GUEST_PORTAL: "GUEST_PORTAL";
        readonly REVIEWS: "REVIEWS";
        readonly SECURITY_REPORTS: "SECURITY_REPORTS";
    }>, z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    overrides: Partial<Record<"HOUSEKEEPING" | "MAINTENANCE" | "PROCUREMENT" | "STAFF" | "RESERVATIONS" | "RESTAURANT_POS" | "BAR_POS" | "INVENTORY" | "RATE_MANAGEMENT" | "CHANNEL_MANAGER" | "ONLINE_PAYMENTS" | "BILLING_INVOICES" | "AI_ASSISTANT" | "AI_REVENUE" | "ANALYTICS" | "MARKETING" | "LOYALTY" | "GUEST_PORTAL" | "REVIEWS" | "SECURITY_REPORTS", boolean>>;
}, {
    overrides: Partial<Record<"HOUSEKEEPING" | "MAINTENANCE" | "PROCUREMENT" | "STAFF" | "RESERVATIONS" | "RESTAURANT_POS" | "BAR_POS" | "INVENTORY" | "RATE_MANAGEMENT" | "CHANNEL_MANAGER" | "ONLINE_PAYMENTS" | "BILLING_INVOICES" | "AI_ASSISTANT" | "AI_REVENUE" | "ANALYTICS" | "MARKETING" | "LOYALTY" | "GUEST_PORTAL" | "REVIEWS" | "SECURITY_REPORTS", boolean>>;
}>;
export type SetFeatureOverridesDto = z.infer<typeof setFeatureOverridesSchema>;
export declare const extendTrialSchema: z.ZodObject<{
    days: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    days: number;
}, {
    days: number;
}>;
export type ExtendTrialDto = z.infer<typeof extendTrialSchema>;
export declare const updatePlatformSettingsSchema: z.ZodObject<{
    platformName: z.ZodOptional<z.ZodString>;
    supportEmail: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    signupEnabled: z.ZodOptional<z.ZodBoolean>;
    trialDays: z.ZodOptional<z.ZodNumber>;
    defaultPlanCode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    billingCurrency: z.ZodOptional<z.ZodString>;
    gracePeriodDays: z.ZodOptional<z.ZodNumber>;
    paymentProvider: z.ZodOptional<z.ZodNullable<z.ZodNativeEnum<{
        readonly PAYSTACK: "PAYSTACK";
        readonly FLUTTERWAVE: "FLUTTERWAVE";
    }>>>;
    paymentPublicKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    paymentSecretKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    platformName?: string | undefined;
    supportEmail?: string | null | undefined;
    signupEnabled?: boolean | undefined;
    trialDays?: number | undefined;
    defaultPlanCode?: string | null | undefined;
    billingCurrency?: string | undefined;
    gracePeriodDays?: number | undefined;
    paymentProvider?: "PAYSTACK" | "FLUTTERWAVE" | null | undefined;
    paymentPublicKey?: string | null | undefined;
    paymentSecretKey?: string | null | undefined;
}, {
    platformName?: string | undefined;
    supportEmail?: string | null | undefined;
    signupEnabled?: boolean | undefined;
    trialDays?: number | undefined;
    defaultPlanCode?: string | null | undefined;
    billingCurrency?: string | undefined;
    gracePeriodDays?: number | undefined;
    paymentProvider?: "PAYSTACK" | "FLUTTERWAVE" | null | undefined;
    paymentPublicKey?: string | null | undefined;
    paymentSecretKey?: string | null | undefined;
}>;
export type UpdatePlatformSettingsDto = z.infer<typeof updatePlatformSettingsSchema>;
export declare const markInvoicePaidSchema: z.ZodObject<{
    reference: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reference?: string | undefined;
    note?: string | undefined;
}, {
    reference?: string | undefined;
    note?: string | undefined;
}>;
export type MarkInvoicePaidDto = z.infer<typeof markInvoicePaidSchema>;
