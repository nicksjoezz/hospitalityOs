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
