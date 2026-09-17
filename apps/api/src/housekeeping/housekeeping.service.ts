import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import {
  DomainEvents,
  HkStatus,
  HkTaskType,
  InspResult,
  MaintCategory,
  MaintSource,
  Priority,
  ReservationCheckedOutPayload,
  Role,
  RoomStatus,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../common/event-bus.service';
import { AuditService } from '../common/audit.service';
import { Actor, systemActor } from '../common/actor';
import { MaintenanceService } from '../maintenance/maintenance.service';

/** A room dirty longer than this raises a supervisor/dashboard alert (§11.2). */
const DIRTY_ALERT_MINUTES = 120;

@Injectable()
export class HousekeepingService {
  private readonly logger = new Logger(HousekeepingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly maintenance: MaintenanceService,
  ) {}

  /**
   * Housekeeping → Maintenance hand-off (plan.md §11.2, acceptance §21): while
   * cleaning, a housekeeper registers a maintenance issue for the room directly
   * from the task. Creates the ticket (source=HOUSEKEEPING) and marks the task
   * blocked pending the fix.
   */
  async registerIssueFromTask(
    actor: Actor,
    taskId: string,
    input: {
      category: MaintCategory;
      priority?: Priority;
      title: string;
      description: string;
      photoUrls?: string[];
      takesRoomOutOfService?: boolean;
    },
  ) {
    const task = await this.prisma.housekeepingTask.findFirst({
      where: { id: taskId, hotelId: actor.hotelId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const ticket = await this.maintenance.registerIssue(actor, {
      roomId: task.roomId,
      category: input.category,
      priority: input.priority,
      title: input.title,
      description: input.description,
      photoUrls: input.photoUrls,
      source: MaintSource.HOUSEKEEPING,
      reporterRole: actor.role ?? Role.HOUSEKEEPING,
      takesRoomOutOfService: input.takesRoomOutOfService,
    });

    await this.prisma.housekeepingTask.update({
      where: { id: taskId },
      data: { note: `Blocked — maintenance ticket ${ticket.id}: ${input.title}` },
    });
    return { ticketId: ticket.id, taskId, roomId: task.roomId };
  }

  /**
   * On checkout, automatically create a CHECKOUT_CLEAN task for the vacated
   * room (plan.md §11.2 / acceptance §21). Runs as the SYSTEM actor.
   */
  @OnEvent(DomainEvents.ReservationCheckedOut)
  async onReservationCheckedOut(
    payload: ReservationCheckedOutPayload,
  ): Promise<void> {
    try {
      await this.createTask(systemActor(payload.hotelId), {
        roomId: payload.roomId,
        type: HkTaskType.CHECKOUT_CLEAN,
        priority: Priority.HIGH,
        note: `Auto-created on checkout of reservation ${payload.reservationId}`,
      });
    } catch (e) {
      this.logger.error(
        `Failed to auto-create cleaning task for room ${payload.roomId}: ${e}`,
      );
    }
  }

  async createTask(
    actor: Actor,
    input: {
      roomId: string;
      type: HkTaskType;
      priority?: Priority;
      assignedToId?: string;
      note?: string;
    },
  ) {
    const task = await this.prisma.housekeepingTask.create({
      data: {
        hotelId: actor.hotelId,
        roomId: input.roomId,
        type: input.type,
        priority: input.priority ?? Priority.MEDIUM,
        status: input.assignedToId ? HkStatus.ASSIGNED : HkStatus.PENDING,
        assignedToId: input.assignedToId,
        createdByType: actor.type,
        note: input.note,
      },
    });
    await this.audit.record({
      actor,
      action: 'housekeeping.task_created',
      entity: 'HousekeepingTask',
      entityId: task.id,
      after: task,
    });
    await this.events.emit(DomainEvents.HousekeepingTaskCreated, {
      hotelId: actor.hotelId,
      taskId: task.id,
      roomId: input.roomId,
    });
    return task;
  }

  async list(hotelId: string, status?: HkStatus) {
    return this.prisma.housekeepingTask.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      include: { room: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  async assign(actor: Actor, taskId: string, userId: string) {
    const task = await this.prisma.housekeepingTask.findFirst({
      where: { id: taskId, hotelId: actor.hotelId },
    });
    if (!task) throw new NotFoundException('Task not found');
    const updated = await this.prisma.housekeepingTask.update({
      where: { id: taskId },
      data: { assignedToId: userId, status: HkStatus.ASSIGNED },
    });
    await this.audit.record({
      actor,
      action: 'housekeeping.task_assigned',
      entity: 'HousekeepingTask',
      entityId: taskId,
      before: task,
      after: updated,
    });
    return updated;
  }

  /** Cleaner starts work → task IN_PROGRESS, room CLEANING. */
  async start(actor: Actor, taskId: string) {
    return this.transition(actor, taskId, {
      status: HkStatus.IN_PROGRESS,
      roomStatus: RoomStatus.CLEANING,
      data: { startedAt: new Date() },
      action: 'housekeeping.started',
    });
  }

  /** Cleaner finishes → task AWAITING_INSPECTION, room INSPECTION. */
  async complete(actor: Actor, taskId: string) {
    return this.transition(actor, taskId, {
      status: HkStatus.AWAITING_INSPECTION,
      roomStatus: RoomStatus.INSPECTION,
      data: { completedAt: new Date() },
      action: 'housekeeping.completed',
    });
  }

  /**
   * Supervisor inspects. PASS → task PASSED, room AVAILABLE (+ lastCleanedAt).
   * FAIL → task FAILED then re-opened as PENDING, room back to DIRTY.
   */
  async inspect(actor: Actor, taskId: string, result: InspResult, note?: string) {
    const task = await this.prisma.housekeepingTask.findFirst({
      where: { id: taskId, hotelId: actor.hotelId },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (result === InspResult.PASS) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.housekeepingTask.update({
          where: { id: taskId },
          data: {
            status: HkStatus.PASSED,
            inspectionResult: InspResult.PASS,
            inspectedById: actor.id,
          },
        });
        await tx.room.update({
          where: { id: task.roomId },
          data: { status: RoomStatus.AVAILABLE, lastCleanedAt: new Date() },
        });
        await this.audit.record(
          {
            actor,
            action: 'housekeeping.inspect_pass',
            entity: 'HousekeepingTask',
            entityId: taskId,
            before: task,
            after: u,
          },
          tx,
        );
        return u;
      });
      return updated;
    }

    // FAIL → reopen a fresh PENDING task, room back to DIRTY.
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.housekeepingTask.update({
        where: { id: taskId },
        data: {
          status: HkStatus.PENDING,
          inspectionResult: InspResult.FAIL,
          inspectedById: actor.id,
          startedAt: null,
          completedAt: null,
          note: note ?? task.note,
        },
      });
      await tx.room.update({
        where: { id: task.roomId },
        data: { status: RoomStatus.DIRTY },
      });
      await this.audit.record(
        {
          actor,
          action: 'housekeeping.inspect_fail',
          entity: 'HousekeepingTask',
          entityId: taskId,
          before: task,
          after: u,
        },
        tx,
      );
      return u;
    });
    return updated;
  }

  private async transition(
    actor: Actor,
    taskId: string,
    opts: {
      status: HkStatus;
      roomStatus: RoomStatus;
      data: Record<string, unknown>;
      action: string;
    },
  ) {
    const task = await this.prisma.housekeepingTask.findFirst({
      where: { id: taskId, hotelId: actor.hotelId },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.housekeepingTask.update({
        where: { id: taskId },
        data: { status: opts.status, ...opts.data },
      });
      await tx.room.update({
        where: { id: task.roomId },
        data: { status: opts.roomStatus },
      });
      await this.audit.record(
        {
          actor,
          action: opts.action,
          entity: 'HousekeepingTask',
          entityId: taskId,
          before: task,
          after: u,
        },
        tx,
      );
      return u;
    });
  }

  /**
   * "Room dirty too long" alert (plan.md §11.2). Every 15 min, flag pending
   * checkout cleans older than the threshold to supervisors/dashboard.
   */
  @Cron('0 */15 * * * *')
  async alertDirtyTooLong(): Promise<void> {
    const cutoff = new Date(Date.now() - DIRTY_ALERT_MINUTES * 60 * 1000);
    const stale = await this.prisma.housekeepingTask.findMany({
      where: {
        status: { in: [HkStatus.PENDING, HkStatus.ASSIGNED] },
        createdAt: { lt: cutoff },
      },
      include: { room: true },
    });
    for (const task of stale) {
      const already = await this.prisma.notification.findFirst({
        where: { type: 'housekeeping.dirty_too_long', entityRef: task.id },
      });
      if (already) continue;
      await this.prisma.notification.create({
        data: {
          hotelId: task.hotelId,
          role: Role.HOUSEKEEPING,
          type: 'housekeeping.dirty_too_long',
          title: `Room ${task.room.roomNumber} dirty too long`,
          body: `Pending since ${task.createdAt.toISOString()}`,
          entityRef: task.id,
        },
      });
      this.logger.warn(
        `Dirty-too-long: room ${task.room.roomNumber} (task ${task.id})`,
      );
    }
  }
}
