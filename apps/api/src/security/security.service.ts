import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentStatus, Role, Severity } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

/** Security: visitor/gate log, incident reports, shift handover (plan.md §11.10). */
@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Visitors ----
  async logVisitor(
    actor: Actor,
    input: { name: string; phone?: string; purpose?: string; hostRoomId?: string },
  ) {
    return this.prisma.visitorLog.create({
      data: {
        hotelId: actor.hotelId,
        name: input.name,
        phone: input.phone,
        purpose: input.purpose,
        hostRoomId: input.hostRoomId,
        recordedById: actor.id ?? 'system',
      },
    });
  }

  async checkoutVisitor(actor: Actor, id: string) {
    const v = await this.prisma.visitorLog.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!v) throw new NotFoundException('Visitor not found');
    return this.prisma.visitorLog.update({
      where: { id },
      data: { checkOutAt: new Date() },
    });
  }

  listVisitors(hotelId: string, activeOnly = false) {
    return this.prisma.visitorLog.findMany({
      where: { hotelId, ...(activeOnly ? { checkOutAt: null } : {}) },
      orderBy: { checkInAt: 'desc' },
      take: 200,
    });
  }

  // ---- Incidents ----
  async createIncident(
    actor: Actor,
    input: {
      type: string;
      severity?: Severity;
      location?: string;
      description: string;
      photoUrls?: string[];
    },
  ) {
    const incident = await this.prisma.securityIncident.create({
      data: {
        hotelId: actor.hotelId,
        type: input.type,
        severity: input.severity ?? Severity.MEDIUM,
        location: input.location,
        description: input.description,
        photoUrls: input.photoUrls ?? [],
        reportedById: actor.id ?? 'system',
        status: IncidentStatus.OPEN,
      },
    });
    await this.audit.record({
      actor,
      action: 'security.incident_created',
      entity: 'SecurityIncident',
      entityId: incident.id,
      after: incident,
    });
    // High/critical incidents escalate to managers immediately.
    if (incident.severity === Severity.HIGH || incident.severity === Severity.CRITICAL) {
      await this.prisma.notification.create({
        data: {
          hotelId: actor.hotelId,
          role: Role.MANAGER,
          type: 'security.incident',
          title: `${incident.severity} security incident: ${incident.type}`,
          body: incident.description.slice(0, 140),
          entityRef: incident.id,
        },
      });
    }
    return incident;
  }

  async updateIncident(
    actor: Actor,
    id: string,
    status: IncidentStatus,
    resolutionNote?: string,
  ) {
    const incident = await this.prisma.securityIncident.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    const updated = await this.prisma.securityIncident.update({
      where: { id },
      data: { status, resolutionNote: resolutionNote ?? incident.resolutionNote },
    });
    await this.audit.record({
      actor,
      action: 'security.incident_updated',
      entity: 'SecurityIncident',
      entityId: id,
      before: incident,
      after: updated,
    });
    return updated;
  }

  listIncidents(hotelId: string, status?: IncidentStatus) {
    return this.prisma.securityIncident.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: { at: 'desc' },
      take: 200,
    });
  }

  // ---- Shift handover ----
  createHandover(
    actor: Actor,
    input: { toUserId: string; notes: string; openItems?: unknown },
  ) {
    return this.prisma.shiftHandover.create({
      data: {
        hotelId: actor.hotelId,
        fromUserId: actor.id ?? 'system',
        toUserId: input.toUserId,
        notes: input.notes,
        openItems: (input.openItems ?? []) as object,
      },
    });
  }

  listHandovers(hotelId: string) {
    return this.prisma.shiftHandover.findMany({
      where: { hotelId },
      orderBy: { at: 'desc' },
      take: 100,
    });
  }
}
