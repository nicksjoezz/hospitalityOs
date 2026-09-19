"use strict";
/**
 * Canonical enum values, mirrored 1:1 with the Prisma enums (plan.md §6).
 * Kept as `as const` objects so they can be used as both values and types
 * on the client (which has no Prisma client).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubInvoiceStatus = exports.ALL_FEATURES = exports.CORE_FEATURES = exports.Feature = exports.PlatformRole = exports.PlanInterval = exports.HotelStatus = exports.AssetStatus = exports.ScheduleFrequency = exports.ChannelType = exports.InvoiceStatus = exports.TaxKind = exports.PromoType = exports.RatePlanKind = exports.WaitlistStatus = exports.TableStatus = exports.LoyaltyTxnType = exports.Channel = exports.SuggestionStatus = exports.IncidentStatus = exports.ReportStatus = exports.Severity = exports.ReportCategory = exports.ApprovalStatus = exports.ShiftState = exports.POStatus = exports.QuoteStatus = exports.MovementType = exports.InvCategory = exports.OrderStatus = exports.Outlet = exports.AreaType = exports.MaintSource = exports.MaintStatus = exports.MaintCategory = exports.InspResult = exports.Priority = exports.HkStatus = exports.HkTaskType = exports.ShiftStatus = exports.PaymentStatus = exports.PaymentType = exports.PaymentMethod = exports.LineType = exports.ReservationSource = exports.BLOCKING_RESERVATION_STATUSES = exports.ReservationStatus = exports.RoomStatus = exports.ActorType = exports.Role = void 0;
exports.FEATURE_LABELS = exports.PlatformPaymentProvider = void 0;
exports.Role = {
    OWNER: 'OWNER',
    MANAGER: 'MANAGER',
    FRONT_DESK: 'FRONT_DESK',
    HOUSEKEEPING: 'HOUSEKEEPING',
    MAINTENANCE: 'MAINTENANCE',
    KITCHEN: 'KITCHEN',
    BAR: 'BAR',
    PROCUREMENT: 'PROCUREMENT',
    SECURITY: 'SECURITY',
    ACCOUNTANT: 'ACCOUNTANT',
};
exports.ActorType = {
    USER: 'USER',
    AI: 'AI',
    SYSTEM: 'SYSTEM',
    GUEST: 'GUEST',
};
exports.RoomStatus = {
    AVAILABLE: 'AVAILABLE',
    OCCUPIED: 'OCCUPIED',
    DIRTY: 'DIRTY',
    CLEANING: 'CLEANING',
    INSPECTION: 'INSPECTION',
    MAINTENANCE: 'MAINTENANCE',
    OUT_OF_SERVICE: 'OUT_OF_SERVICE',
};
exports.ReservationStatus = {
    ENQUIRY: 'ENQUIRY',
    HELD: 'HELD',
    CONFIRMED: 'CONFIRMED',
    CHECKED_IN: 'CHECKED_IN',
    CHECKED_OUT: 'CHECKED_OUT',
    CANCELLED: 'CANCELLED',
    NO_SHOW: 'NO_SHOW',
};
/** Statuses that occupy a room for availability purposes (plan.md §6.2). */
exports.BLOCKING_RESERVATION_STATUSES = [
    exports.ReservationStatus.HELD,
    exports.ReservationStatus.CONFIRMED,
    exports.ReservationStatus.CHECKED_IN,
];
exports.ReservationSource = {
    WHATSAPP: 'WHATSAPP',
    WALK_IN: 'WALK_IN',
    PHONE: 'PHONE',
    OTA: 'OTA',
    WEBSITE: 'WEBSITE',
    CORPORATE: 'CORPORATE',
};
exports.LineType = {
    ROOM: 'ROOM',
    FNB: 'FNB',
    BAR: 'BAR',
    SERVICE: 'SERVICE',
    TAX: 'TAX',
    DISCOUNT: 'DISCOUNT',
    ADJUSTMENT: 'ADJUSTMENT',
};
exports.PaymentMethod = {
    CASH: 'CASH',
    TRANSFER: 'TRANSFER',
    CARD: 'CARD',
    POS: 'POS',
    PAYSTACK: 'PAYSTACK',
    FLUTTERWAVE: 'FLUTTERWAVE',
};
exports.PaymentType = {
    DEPOSIT: 'DEPOSIT',
    BALANCE: 'BALANCE',
    FULL: 'FULL',
    REFUND: 'REFUND',
};
exports.PaymentStatus = {
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    REFUNDED: 'REFUNDED',
};
exports.ShiftStatus = {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    RECONCILED: 'RECONCILED',
};
exports.HkTaskType = {
    CHECKOUT_CLEAN: 'CHECKOUT_CLEAN',
    STAYOVER_CLEAN: 'STAYOVER_CLEAN',
    DEEP_CLEAN: 'DEEP_CLEAN',
    INSPECTION: 'INSPECTION',
    TURN_DOWN: 'TURN_DOWN',
};
exports.HkStatus = {
    PENDING: 'PENDING',
    ASSIGNED: 'ASSIGNED',
    IN_PROGRESS: 'IN_PROGRESS',
    AWAITING_INSPECTION: 'AWAITING_INSPECTION',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
};
exports.Priority = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    URGENT: 'URGENT',
};
exports.InspResult = {
    PASS: 'PASS',
    FAIL: 'FAIL',
};
exports.MaintCategory = {
    HVAC: 'HVAC',
    PLUMBING: 'PLUMBING',
    ELECTRICAL: 'ELECTRICAL',
    FURNITURE: 'FURNITURE',
    APPLIANCE: 'APPLIANCE',
    STRUCTURAL: 'STRUCTURAL',
    NETWORK_TV: 'NETWORK_TV',
    GENERATOR_POWER: 'GENERATOR_POWER',
    OTHER: 'OTHER',
};
exports.MaintStatus = {
    OPEN: 'OPEN',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    ASSIGNED: 'ASSIGNED',
    IN_PROGRESS: 'IN_PROGRESS',
    ON_HOLD: 'ON_HOLD',
    RESOLVED: 'RESOLVED',
    CLOSED: 'CLOSED',
    CANCELLED: 'CANCELLED',
};
exports.MaintSource = {
    HOUSEKEEPING: 'HOUSEKEEPING',
    GUEST: 'GUEST',
    STAFF: 'STAFF',
    FRONT_DESK: 'FRONT_DESK',
    INSPECTION: 'INSPECTION',
    PREVENTIVE: 'PREVENTIVE',
};
exports.AreaType = {
    LOBBY: 'LOBBY',
    RESTAURANT: 'RESTAURANT',
    KITCHEN: 'KITCHEN',
    BAR: 'BAR',
    POOL: 'POOL',
    GYM: 'GYM',
    CORRIDOR: 'CORRIDOR',
    EXTERIOR: 'EXTERIOR',
    GENERATOR: 'GENERATOR',
    OTHER: 'OTHER',
};
exports.Outlet = {
    RESTAURANT: 'RESTAURANT',
    BAR: 'BAR',
    ROOM_SERVICE: 'ROOM_SERVICE',
};
exports.OrderStatus = {
    OPEN: 'OPEN',
    SENT_TO_KITCHEN: 'SENT_TO_KITCHEN',
    PREPARING: 'PREPARING',
    SERVED: 'SERVED',
    PAID: 'PAID',
    CANCELLED: 'CANCELLED',
};
exports.InvCategory = {
    FOOD: 'FOOD',
    BEVERAGE_ALCOHOL: 'BEVERAGE_ALCOHOL',
    BEVERAGE_SOFT: 'BEVERAGE_SOFT',
    TOILETRIES: 'TOILETRIES',
    LINEN: 'LINEN',
    CLEANING: 'CLEANING',
    MAINTENANCE_PARTS: 'MAINTENANCE_PARTS',
    OFFICE: 'OFFICE',
    OTHER: 'OTHER',
};
exports.MovementType = {
    PURCHASE_IN: 'PURCHASE_IN',
    SALE_OUT: 'SALE_OUT',
    WASTAGE: 'WASTAGE',
    TRANSFER: 'TRANSFER',
    ADJUSTMENT: 'ADJUSTMENT',
    COUNT_CORRECTION: 'COUNT_CORRECTION',
};
exports.QuoteStatus = {
    REQUESTED: 'REQUESTED',
    RECEIVED: 'RECEIVED',
    ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED',
};
exports.POStatus = {
    DRAFT: 'DRAFT',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    SENT: 'SENT',
    PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
    RECEIVED: 'RECEIVED',
    CANCELLED: 'CANCELLED',
};
exports.ShiftState = {
    SCHEDULED: 'SCHEDULED',
    CONFIRMED: 'CONFIRMED',
    COMPLETED: 'COMPLETED',
    MISSED: 'MISSED',
    SWAPPED: 'SWAPPED',
};
exports.ApprovalStatus = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
};
exports.ReportCategory = {
    MISCONDUCT: 'MISCONDUCT',
    ABSENCE: 'ABSENCE',
    POLICY_VIOLATION: 'POLICY_VIOLATION',
    SAFETY: 'SAFETY',
    THEFT_SUSPICION: 'THEFT_SUSPICION',
    PERFORMANCE: 'PERFORMANCE',
    HARASSMENT: 'HARASSMENT',
    PRAISE: 'PRAISE',
    OTHER: 'OTHER',
};
exports.Severity = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
};
exports.ReportStatus = {
    SUBMITTED: 'SUBMITTED',
    UNDER_REVIEW: 'UNDER_REVIEW',
    ACTION_TAKEN: 'ACTION_TAKEN',
    DISMISSED: 'DISMISSED',
    RESOLVED: 'RESOLVED',
};
exports.IncidentStatus = {
    OPEN: 'OPEN',
    INVESTIGATING: 'INVESTIGATING',
    RESOLVED: 'RESOLVED',
    ESCALATED: 'ESCALATED',
};
exports.SuggestionStatus = {
    SUGGESTED: 'SUGGESTED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    APPLIED: 'APPLIED',
};
exports.Channel = {
    WHATSAPP: 'WHATSAPP',
    WEB: 'WEB',
    SMS: 'SMS',
    EMAIL: 'EMAIL',
    IN_APP: 'IN_APP',
};
exports.LoyaltyTxnType = {
    EARN: 'EARN',
    REDEEM: 'REDEEM',
    ADJUSTMENT: 'ADJUSTMENT',
};
exports.TableStatus = {
    AVAILABLE: 'AVAILABLE',
    OCCUPIED: 'OCCUPIED',
    RESERVED: 'RESERVED',
    CLEANING: 'CLEANING',
};
exports.WaitlistStatus = {
    WAITING: 'WAITING',
    NOTIFIED: 'NOTIFIED',
    SEATED: 'SEATED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
};
exports.RatePlanKind = {
    BAR: 'BAR',
    NON_REFUNDABLE: 'NON_REFUNDABLE',
    CORPORATE: 'CORPORATE',
    PACKAGE: 'PACKAGE',
};
exports.PromoType = {
    PERCENT: 'PERCENT',
    FIXED: 'FIXED',
};
exports.TaxKind = {
    VAT: 'VAT',
    SERVICE: 'SERVICE',
    OCCUPANCY: 'OCCUPANCY',
    OTHER: 'OTHER',
};
exports.InvoiceStatus = {
    DRAFT: 'DRAFT',
    ISSUED: 'ISSUED',
    PAID: 'PAID',
    VOID: 'VOID',
};
exports.ChannelType = {
    BOOKING_COM: 'BOOKING_COM',
    EXPEDIA: 'EXPEDIA',
    AIRBNB: 'AIRBNB',
    GENERIC: 'GENERIC',
};
exports.ScheduleFrequency = {
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    MONTHLY: 'MONTHLY',
    QUARTERLY: 'QUARTERLY',
    YEARLY: 'YEARLY',
};
exports.AssetStatus = {
    ACTIVE: 'ACTIVE',
    IN_REPAIR: 'IN_REPAIR',
    RETIRED: 'RETIRED',
};
// ===========================================================================
// Platform / multi-tenant SaaS layer (Phase 9)
// ===========================================================================
/** Lifecycle of a tenant hotel on the platform. */
exports.HotelStatus = {
    TRIAL: 'TRIAL', // self-registered, exploring; trial-plan features, until trialEndsAt
    ACTIVE: 'ACTIVE', // approved & live on a paid plan
    SUSPENDED: 'SUSPENDED', // temporarily blocked by the platform (non-payment, abuse…)
    CANCELLED: 'CANCELLED', // closed account
};
/** Billing cadence of a subscription plan. */
exports.PlanInterval = {
    MONTHLY: 'MONTHLY',
    QUARTERLY: 'QUARTERLY',
    YEARLY: 'YEARLY',
};
/** Platform-admin (master controller) privilege levels. */
exports.PlatformRole = {
    SUPER_ADMIN: 'SUPER_ADMIN', // full control incl. managing other admins & impersonation
    STAFF: 'STAFF', // day-to-day tenant management
};
/**
 * Gateable product features. Each maps to one or more app modules; a hotel can
 * only use a feature if its plan includes it (or a per-hotel override enables
 * it). CORE features are always on and cannot be disabled — a hotel can never
 * be locked out of running its front desk.
 */
exports.Feature = {
    // core — always enabled
    RESERVATIONS: 'RESERVATIONS',
    HOUSEKEEPING: 'HOUSEKEEPING',
    MAINTENANCE: 'MAINTENANCE',
    STAFF: 'STAFF',
    // gateable add-ons
    RESTAURANT_POS: 'RESTAURANT_POS',
    BAR_POS: 'BAR_POS',
    INVENTORY: 'INVENTORY',
    PROCUREMENT: 'PROCUREMENT',
    RATE_MANAGEMENT: 'RATE_MANAGEMENT',
    CHANNEL_MANAGER: 'CHANNEL_MANAGER',
    ONLINE_PAYMENTS: 'ONLINE_PAYMENTS',
    BILLING_INVOICES: 'BILLING_INVOICES',
    AI_ASSISTANT: 'AI_ASSISTANT',
    AI_REVENUE: 'AI_REVENUE',
    ANALYTICS: 'ANALYTICS',
    MARKETING: 'MARKETING',
    LOYALTY: 'LOYALTY',
    GUEST_PORTAL: 'GUEST_PORTAL',
    REVIEWS: 'REVIEWS',
    SECURITY_REPORTS: 'SECURITY_REPORTS',
};
/** Features every hotel always has, regardless of plan. */
exports.CORE_FEATURES = [
    exports.Feature.RESERVATIONS,
    exports.Feature.HOUSEKEEPING,
    exports.Feature.MAINTENANCE,
    exports.Feature.STAFF,
];
exports.ALL_FEATURES = Object.values(exports.Feature);
/** Lifecycle of a subscription invoice the platform raises against a hotel. */
exports.SubInvoiceStatus = {
    OPEN: 'OPEN', // issued, awaiting payment
    PAID: 'PAID',
    OVERDUE: 'OVERDUE', // past due date, unpaid
    VOID: 'VOID',
};
/** Gateway the platform (master) uses to collect subscription fees from hotels. */
exports.PlatformPaymentProvider = {
    PAYSTACK: 'PAYSTACK',
    FLUTTERWAVE: 'FLUTTERWAVE',
};
/** Human-readable labels for the master console & tenant UI. */
exports.FEATURE_LABELS = {
    RESERVATIONS: 'Reservations & Front Desk',
    HOUSEKEEPING: 'Housekeeping',
    MAINTENANCE: 'Maintenance',
    STAFF: 'Staff Management',
    RESTAURANT_POS: 'Restaurant POS',
    BAR_POS: 'Bar POS',
    INVENTORY: 'Inventory & Stock',
    PROCUREMENT: 'Procurement & Purchasing',
    RATE_MANAGEMENT: 'Rate Plans & Calendar',
    CHANNEL_MANAGER: 'Channel Manager (OTAs)',
    ONLINE_PAYMENTS: 'Online Payments',
    BILLING_INVOICES: 'Tax Invoices & City Ledger',
    AI_ASSISTANT: 'AI Assistant & Concierge',
    AI_REVENUE: 'AI Revenue Management',
    ANALYTICS: 'Revenue Analytics',
    MARKETING: 'Marketing Campaigns',
    LOYALTY: 'Loyalty Program',
    GUEST_PORTAL: 'Guest Self-Service Portal',
    REVIEWS: 'Review Management',
    SECURITY_REPORTS: 'Security & Confidential Reports',
};
