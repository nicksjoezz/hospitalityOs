import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  ActorType,
  InspResult,
  MaintCategory,
  MaintSource,
  MaintStatus,
  Priority,
  ReportCategory,
  ReservationSource,
  Role,
  Severity,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../common/actor';
import { can } from '../common/policy';
import { ReservationsService } from '../reservations/reservations.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { ComplaintsService } from '../guest-experience/complaints.service';
import { HousekeepingService } from '../housekeeping/housekeeping.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { StaffReportsService } from '../staff-reports/staff-reports.service';
import { InventoryService } from '../inventory/inventory.service';
import { LossService } from '../inventory/loss.service';
import { OrdersService } from '../restaurant/orders.service';
import { ProcurementService } from '../procurement/procurement.service';
import { InvCategory, Outlet } from '@hospitalityos/shared';
import { TOOL_DEFS, ToolAudience } from './tool-definitions';

export interface ToolContext {
  actor: Actor;
  audience: ToolAudience;
  guestId?: string;
  /** The guest's current room (for room-scoped guest actions). */
  roomId?: string;
}

const dateStr = z.string().min(8);

/**
 * Executes AI tool calls against deterministic services (plan.md §7.4–§7.5),
 * with zod validation and RBAC. Tool outputs are authoritative.
 */
import { DynamicAccountsService } from '../payments/dynamic-accounts.service';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly maintenance: MaintenanceService,
    private readonly complaints: ComplaintsService,
    private readonly housekeeping: HousekeepingService,
    private readonly dashboard: DashboardService,
    private readonly staffReports: StaffReportsService,
    private readonly inventory: InventoryService,
    private readonly loss: LossService,
    private readonly orders: OrdersService,
    private readonly procurement: ProcurementService,
    private readonly dvaService: DynamicAccountsService,
  ) {}

  async execute(
    name: string,
    rawInput: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    const def = TOOL_DEFS[name];
    if (!def) throw new Error(`Unknown tool: ${name}`);
    if (!def.audience.includes(ctx.audience)) {
      throw new ForbiddenException(`Tool ${name} not available to ${ctx.audience}`);
    }
    this.logger.debug(`tool ${name} by ${ctx.audience}`);
    const input = (rawInput ?? {}) as Record<string, unknown>;

    switch (name) {
      case 'check_availability':
        return this.checkAvailability(ctx, input);
      case 'quote_price':
        return this.quotePrice(ctx, input);
      case 'create_reservation':
        return this.createReservation(ctx, input);
      case 'get_reservation':
        return this.getReservation(ctx, input);
      case 'register_maintenance_issue':
        return this.registerMaintenance(ctx, input);
      case 'raise_complaint':
        return this.raiseComplaint(ctx, input);
      case 'list_room_status':
        return this.listRoomStatus(ctx, input);
      case 'update_maintenance_ticket':
        return this.updateMaintenance(ctx, input);
      case 'update_housekeeping_task':
        return this.updateHousekeeping(ctx, input);
      case 'get_dashboard_snapshot':
        return this.dashboard.snapshot(ctx.actor.hotelId);
      case 'submit_staff_report':
        return this.submitStaffReport(ctx, input);
      case 'get_stock_levels':
        return this.inventory.list(
          ctx.actor.hotelId,
          (input.category as InvCategory) || undefined,
        );
      case 'log_wastage': {
        const dto = z
          .object({ itemId: z.string().uuid(), quantity: z.number().positive(), reason: z.string().min(1) })
          .parse(input);
        return this.inventory.logWastage(ctx.actor, dto.itemId, dto.quantity, dto.reason);
      }
      case 'get_loss_alerts':
        return this.loss.getAlerts(ctx.actor.hotelId);
      case 'create_order': {
        const dto = z
          .object({
            outlet: z.nativeEnum(Outlet),
            roomId: z.string().uuid().optional(),
            reservationId: z.string().uuid().optional(),
            tableNo: z.string().optional(),
            lines: z
              .array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().positive() }))
              .min(1),
          })
          .parse(input);
        const order = await this.orders.create(ctx.actor, dto);
        return { orderId: order.id, total: order.total, status: order.status };
      }
      case 'draft_purchase_order': {
        const dto = z.object({ supplierId: z.string().uuid() }).parse(input);
        const po = await this.procurement.draftFromLowStock(ctx.actor, dto.supplierId);
        return { poId: po.id, status: po.status, total: po.total };
      }
      case 'get_bank_transfer_details':
        return this.getBankTransferDetails(ctx, input);
      case 'pre_checkin_details':
        return this.preCheckinDetails(ctx, input);
      default:
        throw new Error(`Unhandled tool: ${name}`);
    }
  }

  // ---- guest + staff ----
  private async checkAvailability(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({ checkIn: dateStr, checkOut: dateStr, roomTypeId: z.string().uuid().optional() })
      .parse(input);
    return this.reservations.checkAvailability(ctx.actor.hotelId, {
      checkIn: new Date(dto.checkIn),
      checkOut: new Date(dto.checkOut),
      roomTypeId: dto.roomTypeId,
    });
  }

  private async quotePrice(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({ roomTypeId: z.string().uuid(), checkIn: dateStr, checkOut: dateStr })
      .parse(input);
    return this.reservations.quote(ctx.actor.hotelId, {
      roomTypeId: dto.roomTypeId,
      checkIn: new Date(dto.checkIn),
      checkOut: new Date(dto.checkOut),
    });
  }

  private async createReservation(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({
        guestName: z.string().min(1),
        guestPhone: z.string().min(3),
        roomTypeId: z.string().uuid(),
        checkIn: dateStr,
        checkOut: dateStr,
      })
      .parse(input);
    const res = await this.reservations.create(ctx.actor, {
      guest: { name: dto.guestName, phone: dto.guestPhone },
      roomTypeId: dto.roomTypeId,
      checkIn: new Date(dto.checkIn),
      checkOut: new Date(dto.checkOut),
      adults: 1,
      children: 0,
      source:
        ctx.audience === 'guest'
          ? ReservationSource.WHATSAPP
          : ReservationSource.PHONE,
    });
    return {
      reservationId: res.id,
      status: res.status,
      quotedPrice: res.quotedPrice,
      currency: res.currency,
    };
  }

  private async getReservation(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({ reservationId: z.string().uuid().optional(), guestPhone: z.string().optional() })
      .parse(input);
    if (dto.reservationId) {
      return this.reservations.get(ctx.actor.hotelId, dto.reservationId);
    }
    if (dto.guestPhone) {
      const guest = await this.prisma.guest.findFirst({
        where: { hotelId: ctx.actor.hotelId, phone: dto.guestPhone },
      });
      if (!guest) return { found: false };
      const reservation = await this.prisma.reservation.findFirst({
        where: { hotelId: ctx.actor.hotelId, guestId: guest.id },
        orderBy: { checkInDate: 'desc' },
        include: { room: true, roomType: true, folio: true },
      });
      return reservation ?? { found: false };
    }
    return { found: false, message: 'Provide reservationId or guestPhone' };
  }

  private async registerMaintenance(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({
        roomId: z.string().min(1).optional(),
        category: z.nativeEnum(MaintCategory),
        priority: z.nativeEnum(Priority).optional(),
        title: z.string().min(1),
        description: z.string().min(1),
      })
      .parse(input);

    let targetRoomId = dto.roomId ?? ctx.roomId;
    if (targetRoomId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetRoomId);
      if (!isUuid) {
        const found = await this.prisma.room.findFirst({
          where: { hotelId: ctx.actor.hotelId, roomNumber: targetRoomId, deletedAt: null },
          select: { id: true },
        });
        if (found) targetRoomId = found.id;
      }
    }

    const source =
      ctx.audience === 'guest'
        ? MaintSource.GUEST
        : ctx.actor.role === Role.HOUSEKEEPING
          ? MaintSource.HOUSEKEEPING
          : MaintSource.STAFF;
    const ticket = await this.maintenance.registerIssue(ctx.actor, {
      roomId: targetRoomId,
      category: dto.category,
      priority: dto.priority,
      title: dto.title,
      description: dto.description,
      source,
      reporterRole: ctx.actor.role,
    });
    return { ticketId: ticket.id, status: ticket.status };
  }

  private async raiseComplaint(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({ category: z.string().min(1), description: z.string().min(1) })
      .parse(input);
    const c = await this.complaints.create(ctx.actor, {
      category: dto.category,
      description: dto.description,
      guestId: ctx.guestId,
    });
    return { complaintId: c.id, status: c.status };
  }

  // ---- staff only ----
  private async listRoomStatus(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z.object({ status: z.string().optional() }).parse(input);
    const rooms = await this.prisma.room.findMany({
      where: {
        hotelId: ctx.actor.hotelId,
        deletedAt: null,
        ...(dto.status ? { status: dto.status as never } : {}),
      },
      select: { roomNumber: true, status: true, floor: true },
      orderBy: { roomNumber: 'asc' },
    });
    return { rooms };
  }

  private async updateMaintenance(ctx: ToolContext, input: Record<string, unknown>) {
    if (!can({ role: ctx.actor.role!, extraPermissions: [] }, 'maintenance:update')) {
      throw new ForbiddenException('Not permitted to update maintenance tickets');
    }
    const dto = z
      .object({
        ticketId: z.string().uuid(),
        status: z.nativeEnum(MaintStatus),
        note: z.string().optional(),
      })
      .parse(input);
    const t = await this.maintenance.updateStatus(
      ctx.actor,
      dto.ticketId,
      dto.status,
      dto.note,
    );
    return { ticketId: t.id, status: t.status };
  }

  private async updateHousekeeping(ctx: ToolContext, input: Record<string, unknown>) {
    if (
      !can(
        { role: ctx.actor.role!, extraPermissions: [] },
        'housekeeping:assign',
      )
    ) {
      throw new ForbiddenException('Not permitted to update housekeeping tasks');
    }
    const dto = z
      .object({
        taskId: z.string().uuid(),
        action: z.enum(['start', 'complete', 'inspect']),
        result: z.nativeEnum(InspResult).optional(),
        note: z.string().optional(),
      })
      .parse(input);
    if (dto.action === 'start') {
      const t = await this.housekeeping.start(ctx.actor, dto.taskId);
      return { taskId: t.id, status: t.status };
    }
    if (dto.action === 'complete') {
      const t = await this.housekeeping.complete(ctx.actor, dto.taskId);
      return { taskId: t.id, status: t.status };
    }
    const t = await this.housekeeping.inspect(
      ctx.actor,
      dto.taskId,
      dto.result ?? InspResult.PASS,
      dto.note,
    );
    return { taskId: t.id, status: t.status };
  }

  private async submitStaffReport(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({
        subjectUserId: z.string().uuid().optional(),
        subjectFreeText: z.string().optional(),
        category: z.nativeEnum(ReportCategory),
        severity: z.nativeEnum(Severity).optional(),
        title: z.string().min(1),
        description: z.string().min(1),
        anonymous: z.boolean().optional(),
      })
      .parse(input);
    return this.staffReports.submit(ctx.actor, dto);
  }

  private async getBankTransferDetails(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z.object({ reservationId: z.string().uuid() }).parse(input);
    const dva = await this.dvaService.getOrCreateForReservation(ctx.actor, dto.reservationId);
    return {
      bankName: dva.bankName,
      accountNumber: dva.accountNumber,
      accountName: dva.accountName,
      amountExpectedMinor: dva.amountExpectedMinor,
      expiresAt: dva.expiresAt,
      instructions:
        'Please transfer into this dedicated virtual account. It is linked specifically to your reservation, and your payment will be reconciled automatically.',
    };
  }

  private async preCheckinDetails(ctx: ToolContext, input: Record<string, unknown>) {
    const dto = z
      .object({
        reservationId: z.string().uuid(),
        estimatedArrivalTime: z.string().optional(),
        specialRequests: z.string().optional(),
        dietaryRestrictions: z.string().optional(),
      })
      .parse(input);

    const reservation = await this.prisma.reservation.findFirst({
      where: { id: dto.reservationId, hotelId: ctx.actor.hotelId },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    const combinedRequests = [
      reservation.specialRequests,
      dto.estimatedArrivalTime ? `ETA: ${dto.estimatedArrivalTime}` : null,
      dto.specialRequests ? `Request: ${dto.specialRequests}` : null,
      dto.dietaryRestrictions ? `Dietary: ${dto.dietaryRestrictions}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    await this.prisma.reservation.update({
      where: { id: dto.reservationId },
      data: { specialRequests: combinedRequests },
    });

    if (dto.dietaryRestrictions) {
      await this.prisma.guest.update({
        where: { id: reservation.guestId },
        data: { allergies: dto.dietaryRestrictions },
      });
    }

    return {
      success: true,
      message: 'Pre-check-in preferences and arrival information recorded successfully.',
    };
  }

  /** Marks an actor's type for clarity in logs/audit when invoked by AI. */
  static aiActor(actor: Actor): Actor {
    return { ...actor, type: actor.type ?? ActorType.AI };
  }
}
