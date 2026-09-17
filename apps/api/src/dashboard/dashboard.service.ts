import { Injectable } from '@nestjs/common';
import { formatMoney } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface DashboardSnapshot {
  hotelId: string;
  currency: string;
  occupancy: { occupied: number; total: number; percent: number };
  checkInsToday: number;
  checkOutsToday: number;
  roomsNeedingCleaning: number;
  openMaintenance: number;
  revenueToday: number;
  expectedOutstanding: number;
  staffOnShift: number;
  openComplaints: number;
  openSecurityIncidents: number;
  lowStockItems: number;
  alerts: DashboardAlert[];
  at: string;
}

/**
 * Computes the executive dashboard snapshot (plan.md §11.14). All numbers are
 * computed deterministically here — the AI GM narrates these, never invents them.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(hotelId: string): Promise<DashboardSnapshot> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { currency: true },
    });

    const [
      totalRooms,
      occupiedRooms,
      checkInsToday,
      checkOutsToday,
      dirtyRooms,
      pendingHkTasks,
      openMaintenance,
      paymentsToday,
      inHouseFolios,
      activeShifts,
      openComplaints,
      openIncidents,
      lowStock,
    ] = await Promise.all([
      this.prisma.room.count({ where: { hotelId, deletedAt: null } }),
      this.prisma.room.count({ where: { hotelId, status: 'OCCUPIED' } }),
      this.prisma.reservation.count({
        where: {
          hotelId,
          checkInDate: { gte: startOfDay, lt: endOfDay },
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        },
      }),
      this.prisma.reservation.count({
        where: {
          hotelId,
          checkOutDate: { gte: startOfDay, lt: endOfDay },
          status: { in: ['CHECKED_IN', 'CHECKED_OUT'] },
        },
      }),
      this.prisma.room.count({ where: { hotelId, status: 'DIRTY' } }),
      this.prisma.housekeepingTask.count({
        where: { hotelId, status: { in: ['PENDING', 'ASSIGNED'] } },
      }),
      this.prisma.maintenanceTicket.count({
        where: { hotelId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      }),
      this.prisma.payment.aggregate({
        where: { hotelId, at: { gte: startOfDay, lt: endOfDay } },
        _sum: { baseAmount: true },
      }),
      this.prisma.folio.findMany({
        where: { reservation: { hotelId, status: 'CHECKED_IN' } },
        select: { balance: true },
      }),
      this.prisma.shift.count({
        where: { hotelId, startsAt: { lte: now }, endsAt: { gte: now } },
      }),
      this.prisma.complaint.count({ where: { hotelId, status: 'OPEN' } }),
      this.prisma.securityIncident.count({
        where: { hotelId, status: { in: ['OPEN', 'INVESTIGATING'] } },
      }),
      this.prisma.inventoryItem.findMany({
        where: { hotelId },
        select: { name: true, currentQty: true, reorderPoint: true },
      }),
    ]);

    const lowStockItems = lowStock.filter(
      (i) => Number(i.currentQty) <= Number(i.reorderPoint),
    );
    const revenueToday = paymentsToday._sum.baseAmount ?? 0;
    const expectedOutstanding = inHouseFolios.reduce((s, f) => s + f.balance, 0);
    const roomsNeedingCleaning = dirtyRooms + pendingHkTasks;
    const occupancyPercent =
      totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    const alerts: DashboardAlert[] = [];
    if (openMaintenance > 0)
      alerts.push({
        type: 'maintenance',
        severity: 'warning',
        message: `${openMaintenance} open maintenance ticket(s)`,
      });
    if (lowStockItems.length > 0)
      alerts.push({
        type: 'inventory',
        severity: 'warning',
        message: `${lowStockItems.length} item(s) at/below reorder point: ${lowStockItems
          .map((i) => i.name)
          .slice(0, 5)
          .join(', ')}`,
      });
    if (openIncidents > 0)
      alerts.push({
        type: 'security',
        severity: 'critical',
        message: `${openIncidents} open security incident(s)`,
      });
    if (roomsNeedingCleaning > 0)
      alerts.push({
        type: 'housekeeping',
        severity: 'info',
        message: `${roomsNeedingCleaning} room(s) need cleaning`,
      });

    return {
      hotelId,
      currency: hotel.currency,
      occupancy: {
        occupied: occupiedRooms,
        total: totalRooms,
        percent: occupancyPercent,
      },
      checkInsToday,
      checkOutsToday,
      roomsNeedingCleaning,
      openMaintenance,
      revenueToday,
      expectedOutstanding,
      staffOnShift: activeShifts,
      openComplaints,
      openSecurityIncidents: openIncidents,
      lowStockItems: lowStockItems.length,
      alerts,
      at: now.toISOString(),
    };
  }

  /** A compact text summary used by the AI GM as deterministic context. */
  async textSummary(hotelId: string): Promise<string> {
    const s = await this.snapshot(hotelId);
    const m = (n: number) => formatMoney(n, s.currency);
    return [
      `Occupancy: ${s.occupancy.occupied}/${s.occupancy.total} (${s.occupancy.percent}%)`,
      `Check-ins today: ${s.checkInsToday}; check-outs today: ${s.checkOutsToday}`,
      `Rooms needing cleaning: ${s.roomsNeedingCleaning}`,
      `Open maintenance tickets: ${s.openMaintenance}`,
      `Revenue collected today: ${m(s.revenueToday)}`,
      `Outstanding (in-house) balance: ${m(s.expectedOutstanding)}`,
      `Staff on shift: ${s.staffOnShift}`,
      `Open complaints: ${s.openComplaints}; security incidents: ${s.openSecurityIncidents}`,
      `Low-stock items: ${s.lowStockItems}`,
    ].join('\n');
  }
}
