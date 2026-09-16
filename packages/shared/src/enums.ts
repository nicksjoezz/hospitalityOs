/**
 * Canonical enum values, mirrored 1:1 with the Prisma enums (plan.md §6).
 * Kept as `as const` objects so they can be used as both values and types
 * on the client (which has no Prisma client).
 */

export const Role = {
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
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ActorType = {
  USER: 'USER',
  AI: 'AI',
  SYSTEM: 'SYSTEM',
  GUEST: 'GUEST',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const RoomStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  DIRTY: 'DIRTY',
  CLEANING: 'CLEANING',
  INSPECTION: 'INSPECTION',
  MAINTENANCE: 'MAINTENANCE',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
} as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

export const ReservationStatus = {
  ENQUIRY: 'ENQUIRY',
  HELD: 'HELD',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type ReservationStatus =
  (typeof ReservationStatus)[keyof typeof ReservationStatus];

/** Statuses that occupy a room for availability purposes (plan.md §6.2). */
export const BLOCKING_RESERVATION_STATUSES: ReservationStatus[] = [
  ReservationStatus.HELD,
  ReservationStatus.CONFIRMED,
  ReservationStatus.CHECKED_IN,
];

export const ReservationSource = {
  WHATSAPP: 'WHATSAPP',
  WALK_IN: 'WALK_IN',
  PHONE: 'PHONE',
  OTA: 'OTA',
  WEBSITE: 'WEBSITE',
  CORPORATE: 'CORPORATE',
} as const;
export type ReservationSource =
  (typeof ReservationSource)[keyof typeof ReservationSource];

export const LineType = {
  ROOM: 'ROOM',
  FNB: 'FNB',
  BAR: 'BAR',
  SERVICE: 'SERVICE',
  TAX: 'TAX',
  DISCOUNT: 'DISCOUNT',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type LineType = (typeof LineType)[keyof typeof LineType];

export const PaymentMethod = {
  CASH: 'CASH',
  TRANSFER: 'TRANSFER',
  CARD: 'CARD',
  POS: 'POS',
  PAYSTACK: 'PAYSTACK',
  FLUTTERWAVE: 'FLUTTERWAVE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentType = {
  DEPOSIT: 'DEPOSIT',
  BALANCE: 'BALANCE',
  FULL: 'FULL',
  REFUND: 'REFUND',
} as const;
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

export const PaymentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ShiftStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  RECONCILED: 'RECONCILED',
} as const;
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];

export const HkTaskType = {
  CHECKOUT_CLEAN: 'CHECKOUT_CLEAN',
  STAYOVER_CLEAN: 'STAYOVER_CLEAN',
  DEEP_CLEAN: 'DEEP_CLEAN',
  INSPECTION: 'INSPECTION',
  TURN_DOWN: 'TURN_DOWN',
} as const;
export type HkTaskType = (typeof HkTaskType)[keyof typeof HkTaskType];

export const HkStatus = {
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_INSPECTION: 'AWAITING_INSPECTION',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
} as const;
export type HkStatus = (typeof HkStatus)[keyof typeof HkStatus];

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const InspResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
} as const;
export type InspResult = (typeof InspResult)[keyof typeof InspResult];

export const MaintCategory = {
  HVAC: 'HVAC',
  PLUMBING: 'PLUMBING',
  ELECTRICAL: 'ELECTRICAL',
  FURNITURE: 'FURNITURE',
  APPLIANCE: 'APPLIANCE',
  STRUCTURAL: 'STRUCTURAL',
  NETWORK_TV: 'NETWORK_TV',
  GENERATOR_POWER: 'GENERATOR_POWER',
  OTHER: 'OTHER',
} as const;
export type MaintCategory = (typeof MaintCategory)[keyof typeof MaintCategory];

export const MaintStatus = {
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type MaintStatus = (typeof MaintStatus)[keyof typeof MaintStatus];

export const MaintSource = {
  HOUSEKEEPING: 'HOUSEKEEPING',
  GUEST: 'GUEST',
  STAFF: 'STAFF',
  FRONT_DESK: 'FRONT_DESK',
  INSPECTION: 'INSPECTION',
  PREVENTIVE: 'PREVENTIVE',
} as const;
export type MaintSource = (typeof MaintSource)[keyof typeof MaintSource];

export const AreaType = {
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
} as const;
export type AreaType = (typeof AreaType)[keyof typeof AreaType];

export const Outlet = {
  RESTAURANT: 'RESTAURANT',
  BAR: 'BAR',
  ROOM_SERVICE: 'ROOM_SERVICE',
} as const;
export type Outlet = (typeof Outlet)[keyof typeof Outlet];

export const OrderStatus = {
  OPEN: 'OPEN',
  SENT_TO_KITCHEN: 'SENT_TO_KITCHEN',
  PREPARING: 'PREPARING',
  SERVED: 'SERVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const InvCategory = {
  FOOD: 'FOOD',
  BEVERAGE_ALCOHOL: 'BEVERAGE_ALCOHOL',
  BEVERAGE_SOFT: 'BEVERAGE_SOFT',
  TOILETRIES: 'TOILETRIES',
  LINEN: 'LINEN',
  CLEANING: 'CLEANING',
  MAINTENANCE_PARTS: 'MAINTENANCE_PARTS',
  OFFICE: 'OFFICE',
  OTHER: 'OTHER',
} as const;
export type InvCategory = (typeof InvCategory)[keyof typeof InvCategory];

export const MovementType = {
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  WASTAGE: 'WASTAGE',
  TRANSFER: 'TRANSFER',
  ADJUSTMENT: 'ADJUSTMENT',
  COUNT_CORRECTION: 'COUNT_CORRECTION',
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

export const QuoteStatus = {
  REQUESTED: 'REQUESTED',
  RECEIVED: 'RECEIVED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const POStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type POStatus = (typeof POStatus)[keyof typeof POStatus];

export const ShiftState = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  SWAPPED: 'SWAPPED',
} as const;
export type ShiftState = (typeof ShiftState)[keyof typeof ShiftState];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ReportCategory = {
  MISCONDUCT: 'MISCONDUCT',
  ABSENCE: 'ABSENCE',
  POLICY_VIOLATION: 'POLICY_VIOLATION',
  SAFETY: 'SAFETY',
  THEFT_SUSPICION: 'THEFT_SUSPICION',
  PERFORMANCE: 'PERFORMANCE',
  HARASSMENT: 'HARASSMENT',
  PRAISE: 'PRAISE',
  OTHER: 'OTHER',
} as const;
export type ReportCategory = (typeof ReportCategory)[keyof typeof ReportCategory];

export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const ReportStatus = {
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTION_TAKEN: 'ACTION_TAKEN',
  DISMISSED: 'DISMISSED',
  RESOLVED: 'RESOLVED',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const IncidentStatus = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const SuggestionStatus = {
  SUGGESTED: 'SUGGESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  APPLIED: 'APPLIED',
} as const;
export type SuggestionStatus =
  (typeof SuggestionStatus)[keyof typeof SuggestionStatus];

export const Channel = {
  WHATSAPP: 'WHATSAPP',
  WEB: 'WEB',
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  IN_APP: 'IN_APP',
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export const LoyaltyTxnType = {
  EARN: 'EARN',
  REDEEM: 'REDEEM',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type LoyaltyTxnType = (typeof LoyaltyTxnType)[keyof typeof LoyaltyTxnType];

export const TableStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  CLEANING: 'CLEANING',
} as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];

export const WaitlistStatus = {
  WAITING: 'WAITING',
  NOTIFIED: 'NOTIFIED',
  SEATED: 'SEATED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type WaitlistStatus = (typeof WaitlistStatus)[keyof typeof WaitlistStatus];

export const RatePlanKind = {
  BAR: 'BAR',
  NON_REFUNDABLE: 'NON_REFUNDABLE',
  CORPORATE: 'CORPORATE',
  PACKAGE: 'PACKAGE',
} as const;
export type RatePlanKind = (typeof RatePlanKind)[keyof typeof RatePlanKind];

export const PromoType = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
} as const;
export type PromoType = (typeof PromoType)[keyof typeof PromoType];

export const TaxKind = {
  VAT: 'VAT',
  SERVICE: 'SERVICE',
  OCCUPANCY: 'OCCUPANCY',
  OTHER: 'OTHER',
} as const;
export type TaxKind = (typeof TaxKind)[keyof typeof TaxKind];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PAID: 'PAID',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const ChannelType = {
  BOOKING_COM: 'BOOKING_COM',
  EXPEDIA: 'EXPEDIA',
  AIRBNB: 'AIRBNB',
  GENERIC: 'GENERIC',
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const ScheduleFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
} as const;
export type ScheduleFrequency = (typeof ScheduleFrequency)[keyof typeof ScheduleFrequency];

export const AssetStatus = {
  ACTIVE: 'ACTIVE',
  IN_REPAIR: 'IN_REPAIR',
  RETIRED: 'RETIRED',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

// ===========================================================================
// Platform / multi-tenant SaaS layer (Phase 9)
// ===========================================================================

/** Lifecycle of a tenant hotel on the platform. */
export const HotelStatus = {
  TRIAL: 'TRIAL', // self-registered, exploring; trial-plan features, until trialEndsAt
  ACTIVE: 'ACTIVE', // approved & live on a paid plan
  SUSPENDED: 'SUSPENDED', // temporarily blocked by the platform (non-payment, abuse…)
  CANCELLED: 'CANCELLED', // closed account
} as const;
export type HotelStatus = (typeof HotelStatus)[keyof typeof HotelStatus];

/** Billing cadence of a subscription plan. */
export const PlanInterval = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
} as const;
export type PlanInterval = (typeof PlanInterval)[keyof typeof PlanInterval];

/** Platform-admin (master controller) privilege levels. */
export const PlatformRole = {
  SUPER_ADMIN: 'SUPER_ADMIN', // full control incl. managing other admins & impersonation
  STAFF: 'STAFF', // day-to-day tenant management
} as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

/**
 * Gateable product features. Each maps to one or more app modules; a hotel can
 * only use a feature if its plan includes it (or a per-hotel override enables
 * it). CORE features are always on and cannot be disabled — a hotel can never
 * be locked out of running its front desk.
 */
export const Feature = {
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
} as const;
export type Feature = (typeof Feature)[keyof typeof Feature];

/** Features every hotel always has, regardless of plan. */
export const CORE_FEATURES: Feature[] = [
  Feature.RESERVATIONS,
  Feature.HOUSEKEEPING,
  Feature.MAINTENANCE,
  Feature.STAFF,
];

export const ALL_FEATURES: Feature[] = Object.values(Feature);

/** Lifecycle of a subscription invoice the platform raises against a hotel. */
export const SubInvoiceStatus = {
  OPEN: 'OPEN', // issued, awaiting payment
  PAID: 'PAID',
  OVERDUE: 'OVERDUE', // past due date, unpaid
  VOID: 'VOID',
} as const;
export type SubInvoiceStatus = (typeof SubInvoiceStatus)[keyof typeof SubInvoiceStatus];

/** Gateway the platform (master) uses to collect subscription fees from hotels. */
export const PlatformPaymentProvider = {
  PAYSTACK: 'PAYSTACK',
  FLUTTERWAVE: 'FLUTTERWAVE',
} as const;
export type PlatformPaymentProvider =
  (typeof PlatformPaymentProvider)[keyof typeof PlatformPaymentProvider];

/** Human-readable labels for the master console & tenant UI. */
export const FEATURE_LABELS: Record<Feature, string> = {
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
