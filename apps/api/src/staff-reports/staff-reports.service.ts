import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DomainEvents,
  ReportCategory,
  ReportStatus,
  Role,
  Severity,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../common/event-bus.service';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { Actor } from '../common/actor';

export interface SubmitReportInput {
  subjectUserId?: string;
  subjectFreeText?: string;
  category: ReportCategory;
  severity?: Severity;
  title: string;
  description: string;
  evidenceUrls?: string[];
  anonymous?: boolean;
}

const MANAGER_ROLES: Role[] = [Role.OWNER, Role.MANAGER];

/**
 * Worker-to-worker confidential reporting (plan.md §11.9, acceptance §21).
 * Reports are visible only to OWNER/MANAGER; the reported subject can never see
 * them; anonymous reports hide the reporter from everyone (incl. managers).
 */
@Injectable()
export class StaffReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  async submit(actor: Actor, input: SubmitReportInput) {
    if (!actor.id || !actor.role) {
      throw new ForbiddenException('A staff identity is required to report');
    }
    const report = await this.prisma.staffReport.create({
      data: {
        hotelId: actor.hotelId,
        // Anonymous: drop the plaintext reporter, keep an encrypted copy for
        // restricted audit only (plan.md §11.9, §14).
        reporterId: input.anonymous ? null : actor.id,
        reporterIdEnc: input.anonymous ? this.crypto.encrypt(actor.id) : null,
        reporterRole: actor.role,
        subjectUserId: input.subjectUserId,
        subjectFreeText: input.subjectFreeText,
        category: input.category,
        severity: input.severity ?? Severity.MEDIUM,
        title: input.title,
        description: input.description,
        evidenceUrls: input.evidenceUrls ?? [],
        anonymous: input.anonymous ?? false,
        confidential: true,
        visibleToRoles: MANAGER_ROLES,
        status: ReportStatus.SUBMITTED,
      },
    });

    await this.prisma.staffReportEvent.create({
      data: { reportId: report.id, type: 'submitted', byId: actor.id, note: 'created' },
    });

    // Audit the act of reporting (actor = reporter) WITHOUT leaking the content.
    await this.audit.record({
      actor,
      action: 'staff_report.submit',
      entity: 'StaffReport',
      entityId: report.id,
      after: { id: report.id, category: report.category, severity: report.severity },
    });

    // Notify ONLY managers/owner.
    await this.prisma.notification.createMany({
      data: MANAGER_ROLES.map((role) => ({
        hotelId: actor.hotelId,
        role,
        type: 'staff_report.new',
        title: `New confidential staff report (${report.severity})`,
        body: report.title,
        entityRef: report.id,
      })),
    });

    await this.events.emit(DomainEvents.StaffReportSubmitted, {
      hotelId: actor.hotelId,
      reportId: report.id,
    });

    // Return minimal info to the reporter — not the stored record.
    return { reportId: report.id, status: report.status };
  }

  private assertManager(actor: Actor): void {
    if (!actor.role || !MANAGER_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Staff reports are visible only to managers/owner');
    }
  }

  /**
   * Strip the reporter identity from responses: never expose reporterIdEnc, and
   * null reporterId for anonymous reports (defence-in-depth — it's already null).
   */
  private sanitize<
    T extends { anonymous: boolean; reporterId: string | null; reporterIdEnc?: string | null },
  >(r: T): Omit<T, 'reporterIdEnc'> {
    const { reporterIdEnc: _omit, ...rest } = r;
    if (rest.anonymous) rest.reporterId = null;
    return rest;
  }

  /**
   * OWNER-only: reveal the reporter behind an anonymous report for a serious
   * investigation. The reveal itself is audited.
   */
  async revealReporter(actor: Actor, id: string) {
    if (actor.role !== Role.OWNER) {
      throw new ForbiddenException('Only the OWNER may reveal an anonymous reporter');
    }
    const report = await this.prisma.staffReport.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!report) throw new NotFoundException('Report not found');
    const reporterId = report.anonymous
      ? this.crypto.decrypt(report.reporterIdEnc)
      : report.reporterId;
    await this.audit.record({
      actor,
      action: 'staff_report.reveal_reporter',
      entity: 'StaffReport',
      entityId: id,
      after: { revealedBy: actor.id },
    });
    const reporter = reporterId
      ? await this.prisma.user.findUnique({
          where: { id: reporterId },
          select: { id: true, name: true, role: true },
        })
      : null;
    return { reportId: id, reporter };
  }

  async list(actor: Actor, status?: ReportStatus) {
    this.assertManager(actor);
    const rows = await this.prisma.staffReport.findMany({
      where: { hotelId: actor.hotelId, ...(status ? { status } : {}) },
      orderBy: { at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.sanitize(r));
  }

  async listMine(actor: Actor) {
    if (!actor.id) throw new ForbiddenException('A staff identity is required');
    const rows = await this.prisma.staffReport.findMany({
      where: { hotelId: actor.hotelId, reporterId: actor.id },
      orderBy: { at: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.sanitize(r));
  }

  async get(actor: Actor, id: string) {
    this.assertManager(actor);
    const report = await this.prisma.staffReport.findFirst({
      where: { id, hotelId: actor.hotelId },
      include: { events: { orderBy: { at: 'asc' } } },
    });
    if (!report) throw new NotFoundException('Report not found');
    return this.sanitize(report);
  }

  async updateStatus(
    actor: Actor,
    id: string,
    status: ReportStatus,
    note?: string,
  ) {
    this.assertManager(actor);
    const report = await this.prisma.staffReport.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!report) throw new NotFoundException('Report not found');
    const updated = await this.prisma.staffReport.update({
      where: { id },
      data: { status, resolutionNote: note ?? report.resolutionNote },
    });
    await this.prisma.staffReportEvent.create({
      data: { reportId: id, type: `status:${status}`, byId: actor.id, note },
    });
    await this.audit.record({
      actor,
      action: 'staff_report.update_status',
      entity: 'StaffReport',
      entityId: id,
      after: { id, status },
    });

    // Notify the reporter if the report was not anonymous so they know it was addressed
    if (updated.reporterId) {
      await this.prisma.notification.create({
        data: {
          hotelId: actor.hotelId,
          userId: updated.reporterId,
          type: 'staff_report.status_updated',
          title: `Report status updated: ${status.replace('_', ' ')}`,
          body: `Your confidential report "${updated.title}" is now marked as ${status.replace('_', ' ')}.`,
          entityRef: updated.id,
        },
      });
    }

    return this.sanitize(updated);
  }
}
