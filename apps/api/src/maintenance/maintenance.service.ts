import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DomainEvents,
  MaintCategory,
  MaintSource,
  MaintStatus,
  Priority,
  Role,
  RoomStatus,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../common/event-bus.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

export interface RegisterIssueInput {
  roomId?: string;
  areaId?: string;
  category: MaintCategory;
  priority?: Priority;
  title: string;
  description: string;
  photoUrls?: string[];
  source: MaintSource;
  reporterRole?: Role;
  takesRoomOutOfService?: boolean;
}

/** SLA windows by priority (hours). Overdue escalation arrives in Phase 2. */
const SLA_HOURS: Record<Priority, number> = {
  URGENT: 2,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Suggest a category and priority from free text (plan.md §11.3 — "AI suggests,
   * human can override"). Deterministic keyword heuristic; a human/AI can override
   * the result before the ticket is committed.
   */
  suggestCategory(text: string): { category: MaintCategory; priority: Priority } {
    const t = text.toLowerCase();
    const rules: Array<[RegExp, MaintCategory]> = [
      [/\b(ac|a\/c|air ?con|cooling|heater|hvac|fan)\b/, MaintCategory.HVAC],
      [/\b(leak|tap|faucet|toilet|water|drain|pipe|flush|shower)\b/, MaintCategory.PLUMBING],
      [/\b(light|socket|power|electric|bulb|switch|wiring)\b/, MaintCategory.ELECTRICAL],
      [/\b(bed|chair|table|door|wardrobe|furniture|drawer)\b/, MaintCategory.FURNITURE],
      [/\b(fridge|tv|kettle|microwave|appliance|ac unit)\b/, MaintCategory.APPLIANCE],
      [/\b(wall|ceiling|floor|crack|roof|structural)\b/, MaintCategory.STRUCTURAL],
      [/\b(wifi|internet|network|tv|cable|signal)\b/, MaintCategory.NETWORK_TV],
      [/\b(generator|gen|fuel|diesel|power plant)\b/, MaintCategory.GENERATOR_POWER],
    ];
    const category = rules.find(([re]) => re.test(t))?.[1] ?? MaintCategory.OTHER;
    const priority = /\b(urgent|emergency|flood|fire|no power|sparking|smoke)\b/.test(t)
      ? Priority.URGENT
      : /\b(not working|broken|leak|no water|no ac)\b/.test(t)
        ? Priority.HIGH
        : Priority.MEDIUM;
    return { category, priority };
  }

  /**
   * Register a maintenance issue from any source — guest (WhatsApp), staff,
   * housekeeping, front desk, inspection (plan.md §11.2/§11.3). Optionally takes
   * the room out of service and notifies maintenance.
   */
  async registerIssue(actor: Actor, input: RegisterIssueInput) {
    const priority = input.priority ?? Priority.MEDIUM;
    const slaDueAt = new Date(Date.now() + SLA_HOURS[priority] * 3600 * 1000);

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.maintenanceTicket.create({
        data: {
          hotelId: actor.hotelId,
          roomId: input.roomId,
          areaId: input.areaId,
          category: input.category,
          priority,
          status: MaintStatus.OPEN,
          title: input.title,
          description: input.description,
          photoUrls: input.photoUrls ?? [],
          reportedById: actor.id,
          reportedByType: actor.type,
          reporterRole: input.reporterRole,
          source: input.source,
          takesRoomOutOfService: input.takesRoomOutOfService ?? false,
          slaDueAt,
        },
      });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: created.id,
          type: 'registered',
          byId: actor.id,
          byType: actor.type,
          note: input.description,
        },
      });
      if (input.takesRoomOutOfService && input.roomId) {
        await tx.room.update({
          where: { id: input.roomId },
          data: { status: RoomStatus.MAINTENANCE },
        });
      }
      await this.audit.record(
        {
          actor,
          action: 'maintenance.register',
          entity: 'MaintenanceTicket',
          entityId: created.id,
          after: created,
        },
        tx,
      );
      return created;
    });

    await this.events.emit(DomainEvents.MaintenanceIssueRegistered, {
      hotelId: actor.hotelId,
      ticketId: ticket.id,
      roomId: ticket.roomId,
      category: ticket.category,
      priority: ticket.priority,
    });

    // Notify the maintenance team.
    await this.prisma.notification.create({
      data: {
        hotelId: actor.hotelId,
        role: Role.MAINTENANCE,
        type: 'maintenance.new',
        title: `New ${ticket.category} ticket (${ticket.priority})`,
        body: ticket.title,
        entityRef: ticket.id,
      },
    });

    return ticket;
  }

  async list(
    hotelId: string,
    filter?: { status?: MaintStatus; roomId?: string },
  ) {
    return this.prisma.maintenanceTicket.findMany({
      where: {
        hotelId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.roomId ? { roomId: filter.roomId } : {}),
      },
      include: { room: true, area: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async get(hotelId: string, id: string) {
    const t = await this.prisma.maintenanceTicket.findFirst({
      where: { id, hotelId },
      include: { room: true, area: true, events: { orderBy: { at: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Ticket not found');
    return t;
  }

  async updateStatus(
    actor: Actor,
    id: string,
    status: MaintStatus,
    note?: string,
  ) {
    const current = await this.get(actor.hotelId, id);
    const data: Record<string, unknown> = { status };
    if (status === MaintStatus.RESOLVED) data.resolvedAt = new Date();
    if (status === MaintStatus.CLOSED) data.closedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.maintenanceTicket.update({ where: { id }, data });
      await tx.maintenanceTicketEvent.create({
        data: {
          ticketId: id,
          type: `status:${status}`,
          byId: actor.id,
          byType: actor.type,
          note,
        },
      });
      // Return the room to service when the issue is resolved/closed.
      if (
        (status === MaintStatus.RESOLVED || status === MaintStatus.CLOSED) &&
        current.takesRoomOutOfService &&
        current.roomId
      ) {
        await tx.room.update({
          where: { id: current.roomId },
          data: { status: RoomStatus.DIRTY },
        });
      }
      await this.audit.record(
        {
          actor,
          action: 'maintenance.update_status',
          entity: 'MaintenanceTicket',
          entityId: id,
          before: current,
          after: u,
        },
        tx,
      );
      return u;
    });
    return updated;
  }

  /**
   * SLA escalation (plan.md §11.3): every 10 min, notify managers of tickets
   * past their SLA that are not yet resolved/closed (once per ticket).
   */
  @Cron('0 */10 * * * *')
  async escalateOverdue(): Promise<void> {
    const overdue = await this.prisma.maintenanceTicket.findMany({
      where: {
        status: { notIn: [MaintStatus.RESOLVED, MaintStatus.CLOSED, MaintStatus.CANCELLED] },
        slaDueAt: { lt: new Date() },
      },
      include: { room: true },
    });
    for (const t of overdue) {
      const already = await this.prisma.notification.findFirst({
        where: { type: 'maintenance.overdue', entityRef: t.id },
      });
      if (already) continue;
      await this.prisma.notification.create({
        data: {
          hotelId: t.hotelId,
          role: Role.MANAGER,
          type: 'maintenance.overdue',
          title: `Overdue ${t.priority} ticket${t.room ? ` · Room ${t.room.roomNumber}` : ''}`,
          body: `${t.title} — SLA passed ${t.slaDueAt?.toISOString()}`,
          entityRef: t.id,
        },
      });
      this.logger.warn(`Escalated overdue maintenance ticket ${t.id}`);
    }
  }
}
