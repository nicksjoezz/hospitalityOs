import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@hospitalityos/shared';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';
import { ReportsService } from './reports.service';

function range(q: Record<string, string>) {
  return {
    from: q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86_400_000),
    to: q.to ? new Date(q.to) : new Date(),
  };
}

/** Report center for auditors / finance (plan.md §13). OWNER, MANAGER, ACCOUNTANT. */
@Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  center() {
    return {
      reports: [
        { key: 'cash-reconciliation', formats: ['json', 'csv', 'pdf'] },
        { key: 'revenue', formats: ['json', 'csv', 'pdf'] },
        { key: 'inventory-loss', formats: ['json', 'csv'] },
        { key: 'maintenance', path: '/maintenance/report', formats: ['json', 'csv', 'pdf'] },
      ],
    };
  }

  // ---- Cash reconciliation ----
  @Get('cash-reconciliation')
  cash(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.reports.cashReconciliation(u.hotelId, range(q));
  }

  @Get('cash-reconciliation/export.csv')
  async cashCsv(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>, @Res() res: Response) {
    const csv = await this.reports.cashReconciliationCsv(u.hotelId, range(q));
    res.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="cash-reconciliation.csv"').send(csv);
  }

  @Get('cash-reconciliation/export.pdf')
  async cashPdf(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>, @Res() res: Response) {
    const pdf = await this.reports.cashReconciliationPdf(u.hotelId, range(q));
    res.header('Content-Type', 'application/pdf').header('Content-Disposition', 'attachment; filename="cash-reconciliation.pdf"').send(pdf);
  }

  // ---- Revenue ----
  @Get('revenue')
  revenue(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.reports.revenueReport(u.hotelId, range(q));
  }

  @Get('revenue/export.csv')
  async revenueCsv(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>, @Res() res: Response) {
    const csv = await this.reports.revenueCsv(u.hotelId, range(q));
    res.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="revenue.csv"').send(csv);
  }

  @Get('revenue/export.pdf')
  async revenuePdf(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>, @Res() res: Response) {
    const pdf = await this.reports.revenuePdf(u.hotelId, range(q));
    res.header('Content-Type', 'application/pdf').header('Content-Disposition', 'attachment; filename="revenue.pdf"').send(pdf);
  }

  // ---- Inventory loss ----
  @Get('inventory-loss')
  loss(@CurrentUser() u: AuthUser) {
    return this.reports.lossReport(u.hotelId);
  }

  @Get('inventory-loss/export.csv')
  async lossCsv(@CurrentUser() u: AuthUser, @Res() res: Response) {
    const csv = await this.reports.lossCsv(u.hotelId);
    res.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="inventory-loss.csv"').send(csv);
  }
}
