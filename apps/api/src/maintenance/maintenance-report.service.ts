import { Injectable } from '@nestjs/common';
import { MaintCategory, MaintStatus } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from '../reports/csv.util';
import { buildPdf } from '../reports/pdf.util';

export interface ReportFilters {
  from?: Date;
  to?: Date;
  status?: MaintStatus;
  category?: MaintCategory;
  technicianId?: string;
}

const CLOSED_STATUSES: MaintStatus[] = [MaintStatus.RESOLVED, MaintStatus.CLOSED];

/**
 * Maintenance report (plan.md §11.3, §21): open/closed counts, by room/area/
 * category, average resolution time, overdue, parts consumed, per-room history.
 * Exportable as CSV/PDF.
 */
@Injectable()
export class MaintenanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async fetch(hotelId: string, f: ReportFilters) {
    return this.prisma.maintenanceTicket.findMany({
      where: {
        hotelId,
        ...(f.status ? { status: f.status } : {}),
        ...(f.category ? { category: f.category } : {}),
        ...(f.technicianId ? { assignedToId: f.technicianId } : {}),
        ...(f.from || f.to
          ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
          : {}),
      },
      include: { room: true, area: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generate(hotelId: string, f: ReportFilters) {
    const tickets = await this.fetch(hotelId, f);
    const now = Date.now();

    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byRoom: Record<string, number> = {};
    const byArea: Record<string, number> = {};
    const partsConsumed: Record<string, number> = {};
    let resolutionMsTotal = 0;
    let resolvedCount = 0;
    let overdue = 0;
    let open = 0;
    let closed = 0;

    for (const t of tickets) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
      if (t.room) byRoom[t.room.roomNumber] = (byRoom[t.room.roomNumber] ?? 0) + 1;
      if (t.area) byArea[t.area.name] = (byArea[t.area.name] ?? 0) + 1;

      const isClosed = CLOSED_STATUSES.includes(t.status as MaintStatus);
      if (isClosed) closed += 1;
      else open += 1;

      if (t.resolvedAt) {
        resolutionMsTotal += t.resolvedAt.getTime() - t.createdAt.getTime();
        resolvedCount += 1;
      }
      if (!isClosed && t.slaDueAt && t.slaDueAt.getTime() < now) overdue += 1;

      // partsUsed: optional [{ name, quantity }]
      const parts = Array.isArray(t.partsUsed) ? (t.partsUsed as unknown[]) : [];
      for (const p of parts) {
        const part = p as { name?: string; quantity?: number };
        if (part?.name) {
          partsConsumed[part.name] = (partsConsumed[part.name] ?? 0) + (part.quantity ?? 1);
        }
      }
    }

    const avgResolutionHours =
      resolvedCount > 0
        ? Math.round((resolutionMsTotal / resolvedCount / 3_600_000) * 10) / 10
        : null;

    // Per-room history (most recent first).
    const perRoom: Record<string, typeof tickets> = {};
    for (const t of tickets) {
      const key = t.room?.roomNumber ?? '(no room)';
      (perRoom[key] ??= []).push(t);
    }

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        from: f.from?.toISOString(),
        to: f.to?.toISOString(),
        status: f.status,
        category: f.category,
        technicianId: f.technicianId,
      },
      totals: { total: tickets.length, open, closed, overdue },
      avgResolutionHours,
      byStatus,
      byCategory,
      byRoom,
      byArea,
      partsConsumed,
      perRoomHistory: Object.entries(perRoom).map(([roomNumber, ts]) => ({
        roomNumber,
        count: ts.length,
        tickets: ts.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          status: t.status,
          createdAt: t.createdAt.toISOString(),
          resolvedAt: t.resolvedAt?.toISOString() ?? null,
        })),
      })),
      tickets,
    };
  }

  async csv(hotelId: string, f: ReportFilters): Promise<string> {
    const { tickets } = await this.generate(hotelId, f);
    return toCsv(tickets, [
      { header: 'Ticket ID', value: (t) => t.id },
      { header: 'Title', value: (t) => t.title },
      { header: 'Category', value: (t) => t.category },
      { header: 'Priority', value: (t) => t.priority },
      { header: 'Status', value: (t) => t.status },
      { header: 'Room', value: (t) => t.room?.roomNumber ?? '' },
      { header: 'Area', value: (t) => t.area?.name ?? '' },
      { header: 'Source', value: (t) => t.source },
      { header: 'Created', value: (t) => t.createdAt.toISOString() },
      { header: 'Resolved', value: (t) => t.resolvedAt?.toISOString() ?? '' },
    ]);
  }

  async pdf(hotelId: string, hotelName: string, f: ReportFilters): Promise<Buffer> {
    const r = await this.generate(hotelId, f);
    return buildPdf(
      'Maintenance Report',
      `${hotelName} · generated ${r.generatedAt}`,
      [
        {
          heading: 'Summary',
          lines: [
            `Total tickets: ${r.totals.total}`,
            `Open: ${r.totals.open}   Closed: ${r.totals.closed}   Overdue: ${r.totals.overdue}`,
            `Average resolution time: ${r.avgResolutionHours ?? 'n/a'} hours`,
          ],
        },
        {
          heading: 'By category',
          lines: Object.entries(r.byCategory).map(([k, v]) => `${k}: ${v}`),
        },
        {
          heading: 'By status',
          lines: Object.entries(r.byStatus).map(([k, v]) => `${k}: ${v}`),
        },
        {
          heading: 'By room',
          lines: Object.entries(r.byRoom).map(([k, v]) => `Room ${k}: ${v}`),
        },
        {
          heading: 'Parts consumed',
          lines: Object.entries(r.partsConsumed).map(([k, v]) => `${k}: ${v}`),
        },
      ],
    );
  }
}
