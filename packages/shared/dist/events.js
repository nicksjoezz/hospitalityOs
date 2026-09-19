"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainEvents = void 0;
/**
 * Domain event names emitted on the in-process bus (plan.md §5).
 * String constants so both producers and subscribers reference one source.
 */
exports.DomainEvents = {
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
};
