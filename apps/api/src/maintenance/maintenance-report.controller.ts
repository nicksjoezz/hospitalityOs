import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MaintCategory, MaintStatus, Role } from '@hospitalityos/shared';
import { CurrentUser, Roles, AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { MaintenanceReportService, ReportFilters } from './maintenance-report.service';

@Roles(Role.OWNER, Role.MANAGER, Role.MAINTENANCE)
@Controller('maintenance/report')
export class MaintenanceReportController {
  constructor(
    private readonly report: MaintenanceReportService,
    private readonly prisma: PrismaService,
  ) {}

  private filters(q: Record<string, string | undefined>): ReportFilters {
    return {
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      status: q.status as MaintStatus | undefined,
      category: q.category as MaintCategory | undefined,
      technicianId: q.technicianId,
    };
  }

  @Get()
  json(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    return this.report.generate(user.hotelId, this.filters(q));
  }

  @Get('export.csv')
  async csv(
    @CurrentUser() user: AuthUser,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.report.csv(user.hotelId, this.filters(q));
    res
      .status(200)
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', 'attachment; filename="maintenance-report.csv"')
      .send(csv);
  }

  @Get('export.pdf')
  async pdf(
    @CurrentUser() user: AuthUser,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: user.hotelId },
      select: { name: true },
    });
    const pdf = await this.report.pdf(user.hotelId, hotel.name, this.filters(q));
    res
      .status(200)
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="maintenance-report.pdf"')
      .send(pdf);
  }
}
