/**
 * Domain event names emitted on the in-process bus (plan.md §5).
 * String constants so both producers and subscribers reference one source.
 */
export declare const DomainEvents: {
    readonly ReservationCreated: "reservation.created";
    readonly ReservationModified: "reservation.modified";
    readonly ReservationCancelled: "reservation.cancelled";
    readonly ReservationCheckedIn: "reservation.checked_in";
    readonly ReservationCheckedOut: "reservation.checked_out";
    readonly PaymentRecorded: "payment.recorded";
    readonly HousekeepingTaskCreated: "housekeeping.task_created";
    readonly MaintenanceIssueRegistered: "maintenance.issue_registered";
    readonly InventoryItemLowStock: "inventory.low_stock";
    readonly StaffReportSubmitted: "staff_report.submitted";
    readonly KitchenOrderUpdate: "kitchen.order_update";
};
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
