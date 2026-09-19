import { Injectable } from '@nestjs/common';
import { formatMoney } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RevenueService } from '../revenue/revenue.service';
import { LossService } from '../inventory/loss.service';
import { toCsv } from './csv.util';
import { buildPdf } from './pdf.util';

interface Range {
  from: Date;
  to: Date;
}

/**
 * Financial / operational report center for auditors and management (plan.md §13).
 * Every figure is computed from committed records so an auditor can trace it back
 * to payments, folios and the audit log.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revenue: RevenueService,
    private readonly loss: LossService,
  ) {}

  private async hotelMeta(hotelId: string) {
    return this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true, currency: true },
    });
  }

  // ---- Master Report (Stayflexi Parity Booking Ledger) ----
  async masterReport(
    hotelId: string,
    filter: {
      from?: Date;
      to?: Date;
      dateType?: string;
      status?: string;
      source?: string;
      search?: string;
    },
  ) {
    const where: any = { hotelId, deletedAt: null };
    const dType = filter.dateType || 'checkOut';

    if (filter.from && filter.to) {
      if (dType === 'checkIn') {
        where.checkInDate = { gte: filter.from, lte: filter.to };
      } else if (dType === 'bookingDate') {
        where.createdAt = { gte: filter.from, lte: filter.to };
      } else if (dType === 'stayDate') {
        where.checkInDate = { lte: filter.to };
        where.checkOutDate = { gte: filter.from };
      } else {
        // default checkout date
        where.checkOutDate = { gte: filter.from, lte: filter.to };
      }
    }

    if (filter.status && filter.status !== 'ALL') {
      where.status = filter.status;
    }
    if (filter.source && filter.source !== 'ALL') {
      where.source = filter.source;
    }

    if (filter.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { guest: { name: { contains: q, mode: 'insensitive' } } },
        { guest: { phone: { contains: q, mode: 'insensitive' } } },
        { guest: { email: { contains: q, mode: 'insensitive' } } },
        { room: { roomNumber: { contains: q, mode: 'insensitive' } } },
        { id: { contains: q, mode: 'insensitive' } },
      ];
    }

    const reservations = await this.prisma.reservation.findMany({
      where,
      include: {
        guest: true,
        room: true,
        roomType: true,
        folio: {
          include: {
            payments: {
              orderBy: { at: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { checkInDate: 'desc' },
      take: 1000,
    });

    const rows = reservations.map((r) => {
      const shortId = (parseInt(r.id.replace(/-/g, '').slice(0, 6), 16) % 90000 + 10000).toString();
      const stayNights = Math.max(1, Math.round((r.checkOutDate.getTime() - r.checkInDate.getTime()) / 86400000));
      const latestPayment = r.folio?.payments?.[0];
      const paid = r.folio?.totalPaid ?? 0;
      const charges = r.folio?.totalCharges ?? r.quotedPrice;
      const balance = r.folio?.balance ?? Math.max(0, charges - paid);

      return {
        id: r.id,
        bookingId: shortId,
        roomNumber: r.room?.roomNumber ?? 'Unassigned',
        roomType: r.roomType?.name ?? 'Standard',
        bookingDate: r.createdAt.toISOString().slice(0, 10),
        checkInDate: r.checkInDate.toISOString().slice(0, 10),
        checkOutDate: r.checkOutDate.toISOString().slice(0, 10),
        nights: stayNights,
        source: r.source,
        status: r.status,
        guest: r.guest?.name ?? 'Unknown',
        guestPhone: r.guest?.phone ?? '',
        guestEmail: r.guest?.email ?? '',
        adults: r.adults || 1,
        children: r.children || 0,
        roomsCount: 1,
        quotedPrice: r.quotedPrice,
        totalCharges: charges,
        totalPaid: paid,
        balance,
        currency: r.currency,
        ratePlan: r.ratePlanId ? 'Special Package' : 'Standard Rate',
        paymentMethod: latestPayment?.method ?? (paid > 0 ? 'CARD' : 'PENDING'),
        paymentStatus: paid >= charges && charges > 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
      };
    });

    const totals = {
      totalBookings: rows.length,
      totalAdults: rows.reduce((s, r) => s + r.adults, 0),
      totalChildren: rows.reduce((s, r) => s + r.children, 0),
      totalRooms: rows.reduce((s, r) => s + r.roomsCount, 0),
      totalQuoted: rows.reduce((s, r) => s + r.quotedPrice, 0),
      totalPaid: rows.reduce((s, r) => s + r.totalPaid, 0),
      totalBalance: rows.reduce((s, r) => s + r.balance, 0),
    };

    return {
      generatedAt: new Date().toISOString(),
      dateType: dType,
      range: {
        from: filter.from?.toISOString() ?? null,
        to: filter.to?.toISOString() ?? null,
      },
      totals,
      rows,
    };
  }

  async masterReportCsv(
    hotelId: string,
    filter: {
      from?: Date;
      to?: Date;
      dateType?: string;
      status?: string;
      source?: string;
      search?: string;
    },
  ): Promise<string> {
    const report = await this.masterReport(hotelId, filter);
    return toCsv(report.rows, [
      { header: 'Booking ID', value: (x) => x.bookingId },
      { header: 'Room No.(s)', value: (x) => x.roomNumber },
      { header: 'Room Type', value: (x) => x.roomType },
      { header: 'Booking Date', value: (x) => x.bookingDate },
      { header: 'Check-In', value: (x) => x.checkInDate },
      { header: 'Check-Out', value: (x) => x.checkOutDate },
      { header: 'Nights', value: (x) => x.nights },
      { header: 'Source', value: (x) => x.source },
      { header: 'Booking Status', value: (x) => x.status },
      { header: 'Guest', value: (x) => x.guest },
      { header: 'Phone', value: (x) => x.guestPhone },
      { header: 'Email', value: (x) => x.guestEmail },
      { header: 'Adults', value: (x) => x.adults },
      { header: 'Children', value: (x) => x.children },
      { header: 'No. of Rooms', value: (x) => x.roomsCount },
      { header: 'Rate Plan', value: (x) => x.ratePlan },
      { header: 'Total Amount', value: (x) => x.totalCharges },
      { header: 'Paid Amount', value: (x) => x.totalPaid },
      { header: 'Balance Due', value: (x) => x.balance },
      { header: 'Currency', value: (x) => x.currency },
      { header: 'Payment Method', value: (x) => x.paymentMethod },
      { header: 'Payment Status', value: (x) => x.paymentStatus },
    ]);
  }

  // ---- Cash reconciliation ----
  async cashReconciliation(hotelId: string, range: Range) {
    const shifts = await this.prisma.cashDrawerShift.findMany({
      where: { hotelId, openedAt: { gte: range.from, lte: range.to } },
      orderBy: { openedAt: 'desc' },
    });
    const userIds = [...new Set(shifts.map((s) => s.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const rows = shifts.map((s) => ({
      shiftId: s.id,
      cashier: nameOf.get(s.userId) ?? s.userId,
      openingFloat: s.openingFloat,
      cashCollected: s.expectedCash,
      expectedTotal: s.openingFloat + s.expectedCash,
      countedCash: s.countedCash,
      variance: s.variance,
      status: s.status,
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
    }));
    const totalVariance = rows.reduce((sum, r) => sum + (r.variance ?? 0), 0);
    const shortages = rows.filter((r) => (r.variance ?? 0) < 0).length;
    const surpluses = rows.filter((r) => (r.variance ?? 0) > 0).length;
    return {
      generatedAt: new Date().toISOString(),
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      totals: { shifts: rows.length, totalVariance, shortages, surpluses },
      rows,
    };
  }

  async cashReconciliationCsv(hotelId: string, range: Range): Promise<string> {
    const r = await this.cashReconciliation(hotelId, range);
    return toCsv(r.rows, [
      { header: 'Shift ID', value: (x) => x.shiftId },
      { header: 'Cashier', value: (x) => x.cashier },
      { header: 'Opening Float', value: (x) => x.openingFloat },
      { header: 'Cash Collected', value: (x) => x.cashCollected },
      { header: 'Expected Total', value: (x) => x.expectedTotal },
      { header: 'Counted', value: (x) => x.countedCash ?? '' },
      { header: 'Variance', value: (x) => x.variance ?? '' },
      { header: 'Status', value: (x) => x.status },
      { header: 'Opened', value: (x) => x.openedAt },
      { header: 'Closed', value: (x) => x.closedAt ?? '' },
    ]);
  }

  async cashReconciliationPdf(hotelId: string, range: Range): Promise<Buffer> {
    const r = await this.cashReconciliation(hotelId, range);
    const meta = await this.hotelMeta(hotelId);
    const m = (n: number) => formatMoney(n, meta.currency);
    return buildPdf('Cash Reconciliation Report', `${meta.name} · generated ${r.generatedAt}`, [
      {
        heading: 'Summary',
        lines: [
          `Shifts: ${r.totals.shifts}`,
          `Shortages: ${r.totals.shortages}   Surpluses: ${r.totals.surpluses}`,
          `Net variance: ${m(r.totals.totalVariance)}`,
        ],
      },
      {
        heading: 'Shifts',
        lines: r.rows.map(
          (x) =>
            `${x.cashier}: float ${m(x.openingFloat)} + collected ${m(x.cashCollected)} = ${m(
              x.expectedTotal,
            )}; counted ${x.countedCash === null ? 'n/a' : m(x.countedCash)}; variance ${
              x.variance === null ? 'n/a' : m(x.variance)
            } [${x.status}]`,
        ),
      },
    ]);
  }

  // ---- Revenue ----
  async revenueReport(hotelId: string, range: Range) {
    const analytics = await this.revenue.analytics(hotelId, range.from, range.to);
    const payments = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { hotelId, at: { gte: range.from, lte: range.to } },
      _sum: { baseAmount: true },
      _count: true,
    });
    const byMethod = payments.map((p) => ({
      method: p.method,
      count: p._count,
      total: p._sum.baseAmount ?? 0,
    }));
    const collected = byMethod.reduce((s, p) => s + p.total, 0);
    return { ...analytics, payments: byMethod, totalCollected: collected };
  }

  async revenueCsv(hotelId: string, range: Range): Promise<string> {
    const r = await this.revenueReport(hotelId, range);
    return toCsv(r.payments, [
      { header: 'Method', value: (x) => x.method },
      { header: 'Count', value: (x) => x.count },
      { header: 'Total (minor units)', value: (x) => x.total },
    ]);
  }

  async revenuePdf(hotelId: string, range: Range): Promise<Buffer> {
    const r = await this.revenueReport(hotelId, range);
    const meta = await this.hotelMeta(hotelId);
    const m = (n: number) => formatMoney(n, meta.currency);
    return buildPdf('Revenue Report', `${meta.name} · ${r.from} → ${r.to}`, [
      {
        heading: 'Performance',
        lines: [
          `Occupancy: ${r.occupancyPct}%`,
          `ADR: ${m(r.adr)}   RevPAR: ${m(r.revpar)}`,
          `Room revenue: ${m(r.roomRevenue)} (${r.soldRoomNights}/${r.availableRoomNights} room-nights)`,
          `Total collected (all methods): ${m(r.totalCollected)}`,
        ],
      },
      {
        heading: 'Payments by method',
        lines: r.payments.map((p) => `${p.method}: ${p.count} × — ${m(p.total)}`),
      },
    ]);
  }

  // ---- Inventory loss ----
  async lossReport(hotelId: string) {
    const alerts = await this.loss.getAlerts(hotelId);
    return { generatedAt: new Date().toISOString(), alerts };
  }

  async lossCsv(hotelId: string): Promise<string> {
    const { alerts } = await this.lossReport(hotelId);
    return toCsv(alerts, [
      { header: 'Item', value: (a) => a.name },
      { header: 'Category', value: (a) => a.category },
      { header: 'Expected', value: (a) => a.expectedQty },
      { header: 'Counted', value: (a) => a.countedQty },
      { header: 'Variance', value: (a) => a.variance },
      { header: 'Variance %', value: (a) => a.variancePct },
      { header: 'Probable cause', value: (a) => a.probableCause },
      { header: 'Counted at', value: (a) => a.countedAt },
    ]);
  }
}
