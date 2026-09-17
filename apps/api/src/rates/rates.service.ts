import { Injectable, NotFoundException } from '@nestjs/common';
import { RatePlanKind } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

const DAY = 86_400_000;

/** Rate plans + per-day rate calendar (plan.md §11.12). */
@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) { }

  // ---- Rate plans ----
  createPlan(
    actor: Actor,
    input: {
      roomTypeId: string;
      name: string;
      code: string;
      kind?: RatePlanKind;
      adjustmentType?: string;
      adjustmentValue?: number;
      refundable?: boolean;
    },
  ) {
    return this.prisma.ratePlan.create({
      data: {
        hotelId: actor.hotelId,
        roomTypeId: input.roomTypeId,
        name: input.name,
        code: input.code,
        kind: input.kind ?? RatePlanKind.BAR,
        adjustmentType: input.adjustmentType ?? 'PERCENT',
        adjustmentValue: input.adjustmentValue ?? 0,
        refundable: input.refundable ?? true,
      },
    });
  }

  listPlans(hotelId: string, roomTypeId?: string) {
    return this.prisma.ratePlan.findMany({
      where: { hotelId, ...(roomTypeId ? { roomTypeId } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  // ---- Rate calendar ----
  async getCalendar(hotelId: string, roomTypeId: string, from: Date, to: Date) {
    const rows = await this.prisma.dailyRate.findMany({
      where: { hotelId, roomTypeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      price: r.price,
      minStay: r.minStay,
      maxStay: r.maxStay,
      closedToArrival: r.closedToArrival,
      stopSell: r.stopSell,
    }));
  }

  /**
   * Bulk-set the rate/restriction for each day in [from, to] for a room type.
   * Upserts one DailyRate per day.
   */
  async setCalendar(
    actor: Actor,
    input: {
      roomTypeId: string;
      from: Date;
      to: Date;
      price?: number;
      minStay?: number;
      maxStay?: number;
      closedToArrival?: boolean;
      stopSell?: boolean;
    },
  ) {
    const roomType = await this.prisma.roomType.findFirst({
      where: { id: input.roomTypeId, hotelId: actor.hotelId },
    });
    if (!roomType) throw new NotFoundException('Room type not found');

    const days: Date[] = [];
    for (let t = input.from.getTime(); t <= input.to.getTime(); t += DAY) {
      const d = new Date(t);
      d.setUTCHours(0, 0, 0, 0);
      days.push(d);
    }
    const data = {
      price: input.price ?? roomType.basePrice,
      minStay: input.minStay,
      maxStay: input.maxStay,
      closedToArrival: input.closedToArrival ?? false,
      stopSell: input.stopSell ?? false,
    };
    for (const date of days) {
      await this.prisma.dailyRate.upsert({
        where: { hotelId_roomTypeId_date: { hotelId: actor.hotelId, roomTypeId: input.roomTypeId, date } },
        create: { hotelId: actor.hotelId, roomTypeId: input.roomTypeId, date, ...data },
        update: data,
      });
    }
    await this.audit.record({
      actor,
      action: 'rate.set_calendar',
      entity: 'DailyRate',
      entityId: input.roomTypeId,
      after: { from: input.from, to: input.to, ...data },
    });
    return { updated: days.length };
  }

  /** Set a single day's rate (used by AI auto-apply). */
  async setDay(
    hotelId: string,
    roomTypeId: string,
    date: Date,
    price: number,
  ) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return this.prisma.dailyRate.upsert({
      where: { hotelId_roomTypeId_date: { hotelId, roomTypeId, date: d } },
      create: { hotelId, roomTypeId, date: d, price },
      update: { price },
    });
  }
}
