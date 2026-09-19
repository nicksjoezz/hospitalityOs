/**
 * Canonical enum values, mirrored 1:1 with the Prisma enums (plan.md §6).
 * Kept as `as const` objects so they can be used as both values and types
 * on the client (which has no Prisma client).
 */
export declare const Role: {
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
};
export type Role = (typeof Role)[keyof typeof Role];
export declare const ActorType: {
    readonly USER: "USER";
    readonly AI: "AI";
    readonly SYSTEM: "SYSTEM";
    readonly GUEST: "GUEST";
};
export type ActorType = (typeof ActorType)[keyof typeof ActorType];
export declare const RoomStatus: {
    readonly AVAILABLE: "AVAILABLE";
    readonly OCCUPIED: "OCCUPIED";
    readonly DIRTY: "DIRTY";
    readonly CLEANING: "CLEANING";
    readonly INSPECTION: "INSPECTION";
    readonly MAINTENANCE: "MAINTENANCE";
    readonly OUT_OF_SERVICE: "OUT_OF_SERVICE";
};
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];
export declare const ReservationStatus: {
    readonly ENQUIRY: "ENQUIRY";
    readonly HELD: "HELD";
    readonly CONFIRMED: "CONFIRMED";
    readonly CHECKED_IN: "CHECKED_IN";
    readonly CHECKED_OUT: "CHECKED_OUT";
    readonly CANCELLED: "CANCELLED";
    readonly NO_SHOW: "NO_SHOW";
};
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];
/** Statuses that occupy a room for availability purposes (plan.md §6.2). */
export declare const BLOCKING_RESERVATION_STATUSES: ReservationStatus[];
export declare const ReservationSource: {
    readonly WHATSAPP: "WHATSAPP";
    readonly WALK_IN: "WALK_IN";
    readonly PHONE: "PHONE";
    readonly OTA: "OTA";
    readonly WEBSITE: "WEBSITE";
    readonly CORPORATE: "CORPORATE";
};
export type ReservationSource = (typeof ReservationSource)[keyof typeof ReservationSource];
export declare const LineType: {
    readonly ROOM: "ROOM";
    readonly FNB: "FNB";
    readonly BAR: "BAR";
    readonly SERVICE: "SERVICE";
    readonly TAX: "TAX";
    readonly DISCOUNT: "DISCOUNT";
    readonly ADJUSTMENT: "ADJUSTMENT";
};
export type LineType = (typeof LineType)[keyof typeof LineType];
export declare const PaymentMethod: {
    readonly CASH: "CASH";
    readonly TRANSFER: "TRANSFER";
    readonly CARD: "CARD";
    readonly POS: "POS";
    readonly PAYSTACK: "PAYSTACK";
    readonly FLUTTERWAVE: "FLUTTERWAVE";
};
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export declare const PaymentType: {
    readonly DEPOSIT: "DEPOSIT";
    readonly BALANCE: "BALANCE";
    readonly FULL: "FULL";
    readonly REFUND: "REFUND";
};
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];
export declare const PaymentStatus: {
    readonly PENDING: "PENDING";
    readonly COMPLETED: "COMPLETED";
    readonly FAILED: "FAILED";
    readonly REFUNDED: "REFUNDED";
};
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export declare const ShiftStatus: {
    readonly OPEN: "OPEN";
    readonly CLOSED: "CLOSED";
    readonly RECONCILED: "RECONCILED";
};
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];
export declare const HkTaskType: {
    readonly CHECKOUT_CLEAN: "CHECKOUT_CLEAN";
    readonly STAYOVER_CLEAN: "STAYOVER_CLEAN";
    readonly DEEP_CLEAN: "DEEP_CLEAN";
    readonly INSPECTION: "INSPECTION";
    readonly TURN_DOWN: "TURN_DOWN";
};
export type HkTaskType = (typeof HkTaskType)[keyof typeof HkTaskType];
export declare const HkStatus: {
    readonly PENDING: "PENDING";
    readonly ASSIGNED: "ASSIGNED";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly AWAITING_INSPECTION: "AWAITING_INSPECTION";
    readonly PASSED: "PASSED";
    readonly FAILED: "FAILED";
};
export type HkStatus = (typeof HkStatus)[keyof typeof HkStatus];
export declare const Priority: {
    readonly LOW: "LOW";
    readonly MEDIUM: "MEDIUM";
    readonly HIGH: "HIGH";
    readonly URGENT: "URGENT";
};
export type Priority = (typeof Priority)[keyof typeof Priority];
export declare const InspResult: {
    readonly PASS: "PASS";
    readonly FAIL: "FAIL";
};
export type InspResult = (typeof InspResult)[keyof typeof InspResult];
export declare const MaintCategory: {
    readonly HVAC: "HVAC";
    readonly PLUMBING: "PLUMBING";
    readonly ELECTRICAL: "ELECTRICAL";
    readonly FURNITURE: "FURNITURE";
    readonly APPLIANCE: "APPLIANCE";
    readonly STRUCTURAL: "STRUCTURAL";
    readonly NETWORK_TV: "NETWORK_TV";
    readonly GENERATOR_POWER: "GENERATOR_POWER";
    readonly OTHER: "OTHER";
};
export type MaintCategory = (typeof MaintCategory)[keyof typeof MaintCategory];
export declare const MaintStatus: {
    readonly OPEN: "OPEN";
    readonly ACKNOWLEDGED: "ACKNOWLEDGED";
    readonly ASSIGNED: "ASSIGNED";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly ON_HOLD: "ON_HOLD";
    readonly RESOLVED: "RESOLVED";
    readonly CLOSED: "CLOSED";
    readonly CANCELLED: "CANCELLED";
};
export type MaintStatus = (typeof MaintStatus)[keyof typeof MaintStatus];
export declare const MaintSource: {
    readonly HOUSEKEEPING: "HOUSEKEEPING";
    readonly GUEST: "GUEST";
    readonly STAFF: "STAFF";
    readonly FRONT_DESK: "FRONT_DESK";
    readonly INSPECTION: "INSPECTION";
    readonly PREVENTIVE: "PREVENTIVE";
};
export type MaintSource = (typeof MaintSource)[keyof typeof MaintSource];
export declare const AreaType: {
    readonly LOBBY: "LOBBY";
    readonly RESTAURANT: "RESTAURANT";
    readonly KITCHEN: "KITCHEN";
    readonly BAR: "BAR";
    readonly POOL: "POOL";
    readonly GYM: "GYM";
    readonly CORRIDOR: "CORRIDOR";
    readonly EXTERIOR: "EXTERIOR";
    readonly GENERATOR: "GENERATOR";
    readonly OTHER: "OTHER";
};
export type AreaType = (typeof AreaType)[keyof typeof AreaType];
export declare const Outlet: {
    readonly RESTAURANT: "RESTAURANT";
    readonly BAR: "BAR";
    readonly ROOM_SERVICE: "ROOM_SERVICE";
};
export type Outlet = (typeof Outlet)[keyof typeof Outlet];
export declare const OrderStatus: {
    readonly OPEN: "OPEN";
    readonly SENT_TO_KITCHEN: "SENT_TO_KITCHEN";
    readonly PREPARING: "PREPARING";
    readonly SERVED: "SERVED";
    readonly PAID: "PAID";
    readonly CANCELLED: "CANCELLED";
};
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export declare const InvCategory: {
    readonly FOOD: "FOOD";
    readonly BEVERAGE_ALCOHOL: "BEVERAGE_ALCOHOL";
    readonly BEVERAGE_SOFT: "BEVERAGE_SOFT";
    readonly TOILETRIES: "TOILETRIES";
    readonly LINEN: "LINEN";
    readonly CLEANING: "CLEANING";
    readonly MAINTENANCE_PARTS: "MAINTENANCE_PARTS";
    readonly OFFICE: "OFFICE";
    readonly OTHER: "OTHER";
};
export type InvCategory = (typeof InvCategory)[keyof typeof InvCategory];
export declare const MovementType: {
    readonly PURCHASE_IN: "PURCHASE_IN";
    readonly SALE_OUT: "SALE_OUT";
    readonly WASTAGE: "WASTAGE";
    readonly TRANSFER: "TRANSFER";
    readonly ADJUSTMENT: "ADJUSTMENT";
    readonly COUNT_CORRECTION: "COUNT_CORRECTION";
};
export type MovementType = (typeof MovementType)[keyof typeof MovementType];
export declare const QuoteStatus: {
    readonly REQUESTED: "REQUESTED";
    readonly RECEIVED: "RECEIVED";
    readonly ACCEPTED: "ACCEPTED";
    readonly REJECTED: "REJECTED";
};
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];
export declare const POStatus: {
    readonly DRAFT: "DRAFT";
    readonly PENDING_APPROVAL: "PENDING_APPROVAL";
    readonly APPROVED: "APPROVED";
    readonly SENT: "SENT";
    readonly PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED";
    readonly RECEIVED: "RECEIVED";
    readonly CANCELLED: "CANCELLED";
};
export type POStatus = (typeof POStatus)[keyof typeof POStatus];
export declare const ShiftState: {
    readonly SCHEDULED: "SCHEDULED";
    readonly CONFIRMED: "CONFIRMED";
    readonly COMPLETED: "COMPLETED";
    readonly MISSED: "MISSED";
    readonly SWAPPED: "SWAPPED";
};
export type ShiftState = (typeof ShiftState)[keyof typeof ShiftState];
export declare const ApprovalStatus: {
    readonly PENDING: "PENDING";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
};
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];
export declare const ReportCategory: {
    readonly MISCONDUCT: "MISCONDUCT";
    readonly ABSENCE: "ABSENCE";
    readonly POLICY_VIOLATION: "POLICY_VIOLATION";
    readonly SAFETY: "SAFETY";
    readonly THEFT_SUSPICION: "THEFT_SUSPICION";
    readonly PERFORMANCE: "PERFORMANCE";
    readonly HARASSMENT: "HARASSMENT";
    readonly PRAISE: "PRAISE";
    readonly OTHER: "OTHER";
};
export type ReportCategory = (typeof ReportCategory)[keyof typeof ReportCategory];
export declare const Severity: {
    readonly LOW: "LOW";
    readonly MEDIUM: "MEDIUM";
    readonly HIGH: "HIGH";
    readonly CRITICAL: "CRITICAL";
};
export type Severity = (typeof Severity)[keyof typeof Severity];
export declare const ReportStatus: {
    readonly SUBMITTED: "SUBMITTED";
    readonly UNDER_REVIEW: "UNDER_REVIEW";
    readonly ACTION_TAKEN: "ACTION_TAKEN";
    readonly DISMISSED: "DISMISSED";
    readonly RESOLVED: "RESOLVED";
};
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];
export declare const IncidentStatus: {
    readonly OPEN: "OPEN";
    readonly INVESTIGATING: "INVESTIGATING";
    readonly RESOLVED: "RESOLVED";
    readonly ESCALATED: "ESCALATED";
};
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];
export declare const SuggestionStatus: {
    readonly SUGGESTED: "SUGGESTED";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
    readonly APPLIED: "APPLIED";
};
export type SuggestionStatus = (typeof SuggestionStatus)[keyof typeof SuggestionStatus];
export declare const Channel: {
    readonly WHATSAPP: "WHATSAPP";
    readonly WEB: "WEB";
    readonly SMS: "SMS";
    readonly EMAIL: "EMAIL";
    readonly IN_APP: "IN_APP";
};
export type Channel = (typeof Channel)[keyof typeof Channel];
export declare const LoyaltyTxnType: {
    readonly EARN: "EARN";
    readonly REDEEM: "REDEEM";
    readonly ADJUSTMENT: "ADJUSTMENT";
};
export type LoyaltyTxnType = (typeof LoyaltyTxnType)[keyof typeof LoyaltyTxnType];
export declare const TableStatus: {
    readonly AVAILABLE: "AVAILABLE";
    readonly OCCUPIED: "OCCUPIED";
    readonly RESERVED: "RESERVED";
    readonly CLEANING: "CLEANING";
};
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];
export declare const WaitlistStatus: {
    readonly WAITING: "WAITING";
    readonly NOTIFIED: "NOTIFIED";
    readonly SEATED: "SEATED";
    readonly CANCELLED: "CANCELLED";
    readonly EXPIRED: "EXPIRED";
};
export type WaitlistStatus = (typeof WaitlistStatus)[keyof typeof WaitlistStatus];
export declare const RatePlanKind: {
    readonly BAR: "BAR";
    readonly NON_REFUNDABLE: "NON_REFUNDABLE";
    readonly CORPORATE: "CORPORATE";
    readonly PACKAGE: "PACKAGE";
};
export type RatePlanKind = (typeof RatePlanKind)[keyof typeof RatePlanKind];
export declare const PromoType: {
    readonly PERCENT: "PERCENT";
    readonly FIXED: "FIXED";
};
export type PromoType = (typeof PromoType)[keyof typeof PromoType];
export declare const TaxKind: {
    readonly VAT: "VAT";
    readonly SERVICE: "SERVICE";
    readonly OCCUPANCY: "OCCUPANCY";
    readonly OTHER: "OTHER";
};
export type TaxKind = (typeof TaxKind)[keyof typeof TaxKind];
export declare const InvoiceStatus: {
    readonly DRAFT: "DRAFT";
    readonly ISSUED: "ISSUED";
    readonly PAID: "PAID";
    readonly VOID: "VOID";
};
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export declare const ChannelType: {
    readonly BOOKING_COM: "BOOKING_COM";
    readonly EXPEDIA: "EXPEDIA";
    readonly AIRBNB: "AIRBNB";
    readonly GENERIC: "GENERIC";
};
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];
export declare const ScheduleFrequency: {
    readonly DAILY: "DAILY";
    readonly WEEKLY: "WEEKLY";
    readonly MONTHLY: "MONTHLY";
    readonly QUARTERLY: "QUARTERLY";
    readonly YEARLY: "YEARLY";
};
export type ScheduleFrequency = (typeof ScheduleFrequency)[keyof typeof ScheduleFrequency];
export declare const AssetStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly IN_REPAIR: "IN_REPAIR";
    readonly RETIRED: "RETIRED";
};
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];
/** Lifecycle of a tenant hotel on the platform. */
export declare const HotelStatus: {
    readonly TRIAL: "TRIAL";
    readonly ACTIVE: "ACTIVE";
    readonly SUSPENDED: "SUSPENDED";
    readonly CANCELLED: "CANCELLED";
};
export type HotelStatus = (typeof HotelStatus)[keyof typeof HotelStatus];
/** Billing cadence of a subscription plan. */
export declare const PlanInterval: {
    readonly MONTHLY: "MONTHLY";
    readonly QUARTERLY: "QUARTERLY";
    readonly YEARLY: "YEARLY";
};
export type PlanInterval = (typeof PlanInterval)[keyof typeof PlanInterval];
/** Platform-admin (master controller) privilege levels. */
export declare const PlatformRole: {
    readonly SUPER_ADMIN: "SUPER_ADMIN";
    readonly STAFF: "STAFF";
};
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];
/**
 * Gateable product features. Each maps to one or more app modules; a hotel can
 * only use a feature if its plan includes it (or a per-hotel override enables
 * it). CORE features are always on and cannot be disabled — a hotel can never
 * be locked out of running its front desk.
 */
export declare const Feature: {
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
};
export type Feature = (typeof Feature)[keyof typeof Feature];
/** Features every hotel always has, regardless of plan. */
export declare const CORE_FEATURES: Feature[];
export declare const ALL_FEATURES: Feature[];
/** Lifecycle of a subscription invoice the platform raises against a hotel. */
export declare const SubInvoiceStatus: {
    readonly OPEN: "OPEN";
    readonly PAID: "PAID";
    readonly OVERDUE: "OVERDUE";
    readonly VOID: "VOID";
};
export type SubInvoiceStatus = (typeof SubInvoiceStatus)[keyof typeof SubInvoiceStatus];
/** Gateway the platform (master) uses to collect subscription fees from hotels. */
export declare const PlatformPaymentProvider: {
    readonly PAYSTACK: "PAYSTACK";
    readonly FLUTTERWAVE: "FLUTTERWAVE";
};
export type PlatformPaymentProvider = (typeof PlatformPaymentProvider)[keyof typeof PlatformPaymentProvider];
/** Human-readable labels for the master console & tenant UI. */
export declare const FEATURE_LABELS: Record<Feature, string>;
