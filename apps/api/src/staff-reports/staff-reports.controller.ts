import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, ReportCategory, ReportStatus, Role, Severity } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, RequireFeature, Roles } from '../common/decorators';
import { Actor } from '../common/actor';
import { StaffReportsService } from './staff-reports.service';

const submitSchema = z
  .object({
    subjectUserId: z.string().uuid().optional(),
    subjectFreeText: z.string().optional(),
    category: z.nativeEnum(ReportCategory),
    severity: z.nativeEnum(Severity).optional(),
    title: z.string().min(1),
    description: z.string().min(1),
    evidenceUrls: z.array(z.string()).optional(),
    anonymous: z.boolean().optional(),
  })
  .refine((v) => v.subjectUserId || v.subjectFreeText, {
    message: 'Provide subjectUserId or subjectFreeText',
  });

const statusSchema = z.object({
  status: z.nativeEnum(ReportStatus),
  note: z.string().optional(),
});

@RequireFeature(Feature.SECURITY_REPORTS)
@Controller('staff-reports')
export class StaffReportsController {
  constructor(private readonly reports: StaffReportsService) {}

  /** Any authenticated staff member may submit a report. */
  @Post()
  submit(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(submitSchema)) dto: z.infer<typeof submitSchema>,
  ) {
    return this.reports.submit(actor, dto);
  }

  // Reading is restricted to OWNER/MANAGER (the subject can never see reports).
  @Roles(Role.OWNER, Role.MANAGER)
  @Get()
  list(@CurrentActor() actor: Actor, @Query('status') status?: ReportStatus) {
    return this.reports.list(actor, status);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.reports.get(actor, id);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Patch(':id/status')
  updateStatus(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) dto: z.infer<typeof statusSchema>,
  ) {
    return this.reports.updateStatus(actor, id, dto.status, dto.note);
  }

  /** OWNER-only: reveal an anonymous reporter for a serious investigation (audited). */
  @Roles(Role.OWNER)
  @Post(':id/reveal-reporter')
  reveal(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.reports.revealReporter(actor, id);
  }
}
