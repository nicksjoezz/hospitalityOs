/**
 * Domain event names emitted on the in-process bus (plan.md §5).
 * String constants so both producers and subscribers reference one source.
 */
export const DomainEvents = {
  ReservationCreated: 'reservation.created',
  ReservationModified: 'reservation.modified',
  ReservationCancelled: 'reservation.cancelled',
  ReservationCheckedIn: 'reservation.checked_in',
  ReservationCheckedOut: 'reservation.checked_out',
  PaymentRecorded: 'payment.recorded',
  HousekeepingTaskCreated: 'housekeeping.task_created',
  MaintenanceIssueRegistered: 'maintenance.issue_registered',
  InventoryItemLowStock: 'inventory.low_stock',
  StaffReportSubmitted: 'staff_report.submitted',
  KitchenOrderUpdate: 'kitchen.order_update',
} as const;
export type DomainEventName = (typeof DomainEvents)[keyof typeof DomainEvents];

export interface ReservationCheckedOutPayload {
  hotelId: string;
  reservationId: string;
  roomId: string;
  folioBalance: number;
  actorId?: string;
}

export interface ReservationCheckedInPayload {
  hotelId: string;
  reservationId: string;
  roomId: string;
  actorId?: string;
}

export interface PaymentRecordedPayload {
  hotelId: string;
  paymentId: string;
  reservationId?: string;
  folioId?: string;
  amount: number;
  balance: number;
}
