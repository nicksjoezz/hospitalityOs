import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  Role,
  ShiftState,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/** Staff scheduling, attendance, and leave (plan.md §11.9). */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  upsertProfile(
    actor: Actor,
    userId: string,
    input: {
      department: Role;
      hourlyRate?: number;
      hireDate?: Date;
      emergencyContact?: string;
    },
  ) {
    return this.prisma.staffProfile.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
    });
  }

  /** Create a shift, rejecting overlaps for the same user (conflict detection). */
  async createShift(
    actor: Actor,
    input: { userId: string; role: Role; startsAt: Date; endsAt: Date; note?: string },
  ) {
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException('Shift end must be after start');
    }
    const overlap = await this.prisma.shift.findFirst({
      where: {
        hotelId: actor.hotelId,
        userId: input.userId,
        status: { notIn: [ShiftState.SWAPPED, ShiftState.MISSED] },
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
    });
    if (overlap) {
      throw new BadRequestException('Shift overlaps an existing shift for this user');
    }
    const shift = await this.prisma.shift.create({
      data: {
        hotelId: actor.hotelId,
        userId: input.userId,
        role: input.role,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        note: input.note,
        status: ShiftState.SCHEDULED,
      },
    });
    await this.audit.record({
      actor,
      action: 'staff.shift_created',
      entity: 'Shift',
      entityId: shift.id,
      after: shift,
    });
    return shift;
  }

  listShifts(hotelId: string, filter?: { userId?: string; from?: Date; to?: Date }) {
    return this.prisma.shift.findMany({
      where: {
        hotelId,
        ...(filter?.userId ? { userId: filter.userId } : {}),
        ...(filter?.from || filter?.to
          ? {
              startsAt: {
                ...(filter?.from ? { gte: filter.from } : {}),
                ...(filter?.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
  }

  todaySchedule(hotelId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.prisma.shift.findMany({
      where: { hotelId, startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: 'asc' },
    });
  }

  async clockIn(
    actor: Actor,
    input?: { shiftId?: string; lat?: number; lng?: number; selfieUrl?: string },
  ) {
    if (!actor.id) throw new BadRequestException('User required');

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: actor.hotelId },
      select: { settings: true },
    });

    const settings = (hotel?.settings as Record<string, unknown>) || {};
    const hotelLat = typeof settings.latitude === 'number' ? settings.latitude : null;
    const hotelLng = typeof settings.longitude === 'number' ? settings.longitude : null;
    const maxRadius = typeof settings.geofenceRadiusMeters === 'number' ? settings.geofenceRadiusMeters : 100;

    let flagged = false;
    let flagReason: string | undefined;
    let distanceMeters: number | undefined;

    if (hotelLat !== null && hotelLng !== null) {
      if (typeof input?.lat === 'number' && typeof input?.lng === 'number') {
        distanceMeters = haversineMeters(hotelLat, hotelLng, input.lat, input.lng);
        if (distanceMeters > maxRadius) {
          flagged = true;
          flagReason = `Clock-in was ${distanceMeters}m away (allowed: ${maxRadius}m)`;
        }
      } else {
        flagged = true;
        flagReason = 'Location coordinates missing for geofenced property';
      }
    }

    const record = await this.prisma.attendanceRecord.create({
      data: {
        hotelId: actor.hotelId,
        userId: actor.id,
        shiftId: input?.shiftId,
        clockInAt: new Date(),
        method: input?.selfieUrl ? 'selfie-gps' : 'app',
        lat: input?.lat,
        lng: input?.lng,
        selfieUrl: input?.selfieUrl,
        distanceMeters,
        flagged,
        flagReason,
      },
    });
    return record;
  }

  async listAttendance(
    hotelId: string,
    filter?: { userId?: string; flagged?: boolean; limit?: number },
  ) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        hotelId,
        ...(filter?.userId ? { userId: filter.userId } : {}),
        ...(filter?.flagged !== undefined ? { flagged: filter.flagged } : {}),
      },
      orderBy: { clockInAt: 'desc' },
      take: filter?.limit ?? 100,
    });
  }

  async clockOut(actor: Actor) {
    if (!actor.id) throw new BadRequestException('User required');
    const open = await this.prisma.attendanceRecord.findFirst({
      where: { hotelId: actor.hotelId, userId: actor.id, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (!open) throw new NotFoundException('No open attendance record to close');
    return this.prisma.attendanceRecord.update({
      where: { id: open.id },
      data: { clockOutAt: new Date() },
    });
  }

  async requestLeave(
    actor: Actor,
    input: { type: string; startDate: Date; endDate: Date; reason?: string },
  ) {
    if (!actor.id) throw new BadRequestException('User required');
    const req = await this.prisma.leaveRequest.create({
      data: {
        hotelId: actor.hotelId,
        userId: actor.id,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        reason: input.reason,
        status: ApprovalStatus.PENDING,
      },
    });

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { name: true },
      });
      await this.prisma.notification.create({
        data: {
          hotelId: actor.hotelId,
          role: Role.MANAGER,
          type: 'staff.leave_requested',
          title: `Leave requested: ${user?.name ?? 'Staff member'}`,
          body: `${input.type} leave from ${new Date(input.startDate).toLocaleDateString()} to ${new Date(input.endDate).toLocaleDateString()}. ${input.reason ? `Reason: ${input.reason}` : ''}`,
          entityRef: req.id,
        },
      });
    } catch {
      // Notification is non-blocking
    }

    return req;
  }

  async decideLeave(actor: Actor, id: string, status: ApprovalStatus) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!leave) throw new NotFoundException('Leave request not found');
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status, decidedById: actor.id },
    });

    try {
      await this.prisma.notification.create({
        data: {
          hotelId: actor.hotelId,
          userId: leave.userId,
          type: 'staff.leave_decided',
          title: `Leave request ${status.toLowerCase()}`,
          body: `Your ${leave.type} leave request from ${new Date(leave.startDate).toLocaleDateString()} has been ${status.toLowerCase()}.`,
          entityRef: leave.id,
        },
      });
    } catch {
      // Notification is non-blocking
    }

    return updated;
  }

  /**
   * Weekly/monthly payroll calculation from attendance × hourly rate, with overtime
   * over 40h at 1.5× (plan.md §13; KitchenOS-inspired). Amounts in minor units.
   */
  async payroll(hotelId: string, from: Date, to: Date) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        hotelId,
        clockInAt: { gte: from },
        clockOutAt: { not: null, lte: to },
      },
    });
    const users = await this.prisma.user.findMany({
      where: { hotelId, active: true, deletedAt: null },
      select: { id: true, name: true, role: true, phone: true },
      orderBy: { name: 'asc' },
    });
    const profiles = await this.prisma.staffProfile.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    const rateOf = new Map(profiles.map((p) => [p.userId, p.hourlyRate ?? 0]));

    const hoursByUser = new Map<string, number>();
    for (const r of records) {
      if (!r.clockInAt || !r.clockOutAt) continue;
      const hours = (r.clockOutAt.getTime() - r.clockInAt.getTime()) / 3_600_000;
      hoursByUser.set(r.userId, (hoursByUser.get(r.userId) ?? 0) + hours);
    }

    const lines = users.map((u) => {
      const hours = hoursByUser.get(u.id) ?? 0;
      const rate = rateOf.get(u.id) ?? 0;
      const regularHours = Math.min(hours, 40);
      const overtimeHours = Math.max(0, hours - 40);
      const regular = Math.round(regularHours * rate);
      const overtime = Math.round(overtimeHours * rate * 1.5);
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        hours: Math.round(hours * 10) / 10,
        rate,
        regular,
        overtime,
        total: regular + overtime,
      };
    });

    lines.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
    const totalLabor = lines.reduce((s, l) => s + l.total, 0);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      lines,
      totalLabor,
    };
  }

  async payrollMine(actor: Actor, from: Date, to: Date) {
    if (!actor.id) throw new BadRequestException('User required');
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        hotelId: actor.hotelId,
        userId: actor.id,
        clockInAt: { gte: from },
        clockOutAt: { not: null, lte: to },
      },
    });
    const profile = await this.prisma.staffProfile.findUnique({
      where: { userId: actor.id },
    });
    const rate = profile?.hourlyRate ?? 0;
    let hours = 0;
    for (const r of records) {
      if (!r.clockInAt || !r.clockOutAt) continue;
      hours += (r.clockOutAt.getTime() - r.clockInAt.getTime()) / 3_600_000;
    }
    const regularHours = Math.min(hours, 40);
    const overtimeHours = Math.max(0, hours - 40);
    const regular = Math.round(regularHours * rate);
    const overtime = Math.round(overtimeHours * rate * 1.5);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      hours: Math.round(hours * 10) / 10,
      regularHours: Math.round(regularHours * 10) / 10,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      rate,
      regular,
      overtime,
      total: regular + overtime,
    };
  }

  async finalizePayroll(actor: Actor, from: Date, to: Date, note?: string) {
    const p = await this.payroll(actor.hotelId, from, to);
    await this.audit.record({
      actor,
      action: 'payroll.finalize',
      entity: 'Payroll',
      entityId: `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`,
      after: {
        from: p.from,
        to: p.to,
        totalLabor: p.totalLabor,
        staffCount: p.lines.filter((l) => l.hours > 0).length,
        note,
      },
    });

    const staffWithPay = p.lines.filter((l) => l.total > 0);
    if (staffWithPay.length > 0) {
      await this.prisma.notification.createMany({
        data: staffWithPay.map((s) => ({
          hotelId: actor.hotelId,
          userId: s.userId,
          type: 'payroll.finalized',
          title: 'Payslip Ready for Payout',
          body: `Your payslip for ${from.toLocaleDateString()} to ${to.toLocaleDateString()} has been finalized. Total: ${(s.total / 100).toLocaleString()}`,
        })),
      });
    }

    return {
      ok: true,
      totalLabor: p.totalLabor,
      staffPaidCount: staffWithPay.length,
      period: { from: p.from, to: p.to },
    };
  }

  listUsers(hotelId: string) {
    return this.prisma.user.findMany({
      where: { hotelId, active: true, deletedAt: null },
      select: { id: true, name: true, role: true, phone: true },
      orderBy: { name: 'asc' },
    });
  }

  listLeave(hotelId: string, status?: ApprovalStatus) {
    return this.prisma.leaveRequest.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: { startDate: 'desc' },
      take: 200,
    });
  }
}
