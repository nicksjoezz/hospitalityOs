import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BLOCKING_RESERVATION_STATUSES,
  SuggestionStatus,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { RatesService } from '../rates/rates.service';
import { Actor } from '../common/actor';

const DAY_MS = 86_400_000;
const COUNTED_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];

function nightsBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}

/**
 * Revenue management (plan.md §11.12). All numbers are computed deterministically
 * here; the AI GM only narrates them. Provides occupancy/ADR/RevPAR analytics and
 * AI price suggestions that flow suggest → approve → apply.
 */
@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rates: RatesService,
  ) {}

  /**
   * Demand forecast / pace (plan.md §11.12): on-the-books occupancy and projected
   * room revenue per day for the next `horizonDays`.
   */
  async forecast(hotelId: string, horizonDays = 30) {
    const totalRooms = await this.prisma.room.count({ where: { hotelId, deletedAt: null } });
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const horizonEnd = new Date(start.getTime() + horizonDays * DAY_MS);
    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        status: { in: BLOCKING_RESERVATION_STATUSES as never },
        checkInDate: { lt: horizonEnd },
        checkOutDate: { gt: start },
      },
      select: { checkInDate: true, checkOutDate: true, quotedPrice: true },
    });

    const days = [];
    let totalRoomNights = 0;
    let totalProjected = 0;
    for (let i = 0; i < horizonDays; i++) {
      const d = new Date(start.getTime() + i * DAY_MS);
      const next = new Date(d.getTime() + DAY_MS);
      let roomsBooked = 0;
      let revenue = 0;
      for (const r of reservations) {
        if (r.checkInDate < next && r.checkOutDate > d) {
          roomsBooked += 1;
          const n = Math.max(1, nightsBetween(r.checkInDate, r.checkOutDate));
          revenue += Math.round(r.quotedPrice / n);
        }
      }
      totalRoomNights += roomsBooked;
      totalProjected += revenue;
      days.push({
        date: d.toISOString().slice(0, 10),
        roomsBooked,
        occupancyPct: totalRooms > 0 ? Math.round((roomsBooked / totalRooms) * 100) : 0,
        projectedRevenue: revenue,
      });
    }
    return {
      horizonDays,
      totalRooms,
      pickup: { roomNights: totalRoomNights, projectedRevenue: totalProjected },
      days,
    };
  }

  /** Occupancy %, ADR (avg daily rate) and RevPAR over a date range. */
  async analytics(hotelId: string, from: Date, to: Date) {
    if (to <= from) throw new BadRequestException('`to` must be after `from`');
    const days = Math.max(1, nightsBetween(from, to));
    const totalRooms = await this.prisma.room.count({
      where: { hotelId, deletedAt: null },
    });
    const availableRoomNights = totalRooms * days;

    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        status: { in: COUNTED_STATUSES as never },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
      },
    });

    let soldRoomNights = 0;
    let roomRevenue = 0;
    for (const r of reservations) {
      const stayNights = Math.max(1, nightsBetween(r.checkInDate, r.checkOutDate));
      const overlapStart = r.checkInDate > from ? r.checkInDate : from;
      const overlapEnd = r.checkOutDate < to ? r.checkOutDate : to;
      const overlapNights = nightsBetween(overlapStart, overlapEnd);
      if (overlapNights <= 0) continue;
      soldRoomNights += overlapNights;
      const perNight = r.quotedPrice / stayNights;
      roomRevenue += Math.round(perNight * overlapNights);
    }

    const occupancyPct =
      availableRoomNights > 0
        ? Math.round((soldRoomNights / availableRoomNights) * 1000) / 10
        : 0;
    const adr = soldRoomNights > 0 ? Math.round(roomRevenue / soldRoomNights) : 0;
    const revpar =
      availableRoomNights > 0 ? Math.round(roomRevenue / availableRoomNights) : 0;

    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { currency: true },
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      totalRooms,
      availableRoomNights,
      soldRoomNights,
      occupancyPct,
      adr,
      revpar,
      roomRevenue,
      currency: hotel.currency,
    };
  }

  /**
   * Detailed historical / past revenue breakdown.
   * Day-by-day revenue ledger, room vs F&B vs other, ADR, RevPAR, and source channels.
   */
  async pastRevenue(hotelId: string, from: Date, to: Date) {
    if (to <= from) throw new BadRequestException('`to` must be after `from`');
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { currency: true },
    });

    const totalRooms = await this.prisma.room.count({
      where: { hotelId, deletedAt: null },
    });

    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        status: { in: COUNTED_STATUSES as never },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
      },
      include: {
        folio: {
          include: {
            lineItems: true,
          },
        },
      },
    });

    const numDays = Math.max(1, nightsBetween(from, to));
    const daily: Array<{
      date: string;
      roomsSold: number;
      occupancyPct: number;
      roomRevenue: number;
      fbRevenue: number;
      otherRevenue: number;
      totalRevenue: number;
      adr: number;
      revpar: number;
      variancePct: number;
    }> = [];

    let totalSoldRoomNights = 0;
    let totalRoomRevenue = 0;
    let totalFbRevenue = 0;
    let totalOtherRevenue = 0;

    const sourceMap = new Map<string, { bookings: number; roomNights: number; revenue: number }>();

    for (const r of reservations) {
      const src = r.source || 'WALK_IN';
      const entry = sourceMap.get(src) || { bookings: 0, roomNights: 0, revenue: 0 };
      entry.bookings += 1;

      const stayNights = Math.max(1, nightsBetween(r.checkInDate, r.checkOutDate));
      const overlapStart = r.checkInDate > from ? r.checkInDate : from;
      const overlapEnd = r.checkOutDate < to ? r.checkOutDate : to;
      const overlapNights = Math.max(0, nightsBetween(overlapStart, overlapEnd));
      entry.roomNights += overlapNights;
      const perNight = r.quotedPrice / stayNights;
      entry.revenue += Math.round(perNight * overlapNights);
      sourceMap.set(src, entry);
    }

    let prevDayTotal = 0;
    for (let i = 0; i < numDays; i++) {
      const dayStart = new Date(from.getTime() + i * DAY_MS);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const dateStr = dayStart.toISOString().slice(0, 10);

      let dayRoomsSold = 0;
      let dayRoomRev = 0;
      let dayFbRev = 0;
      let dayOtherRev = 0;

      for (const r of reservations) {
        if (r.checkInDate < dayEnd && r.checkOutDate > dayStart) {
          dayRoomsSold += 1;
          const stayNights = Math.max(1, nightsBetween(r.checkInDate, r.checkOutDate));
          dayRoomRev += Math.round(r.quotedPrice / stayNights);

          if (r.folio?.lineItems) {
            for (const item of r.folio.lineItems) {
              if (item.at >= dayStart && item.at < dayEnd) {
                if (item.type === 'FNB' || item.type === 'BAR') {
                  dayFbRev += item.amount;
                } else if (item.type !== 'ROOM') {
                  dayOtherRev += item.amount;
                }
              }
            }
          }
        }
      }

      const dayTotal = dayRoomRev + dayFbRev + dayOtherRev;
      const occPct = totalRooms > 0 ? Math.round((dayRoomsSold / totalRooms) * 1000) / 10 : 0;
      const adr = dayRoomsSold > 0 ? Math.round(dayRoomRev / dayRoomsSold) : 0;
      const revpar = totalRooms > 0 ? Math.round(dayRoomRev / totalRooms) : 0;
      const variance = prevDayTotal > 0 ? Math.round(((dayTotal - prevDayTotal) / prevDayTotal) * 1000) / 10 : 0;
      prevDayTotal = dayTotal;

      totalSoldRoomNights += dayRoomsSold;
      totalRoomRevenue += dayRoomRev;
      totalFbRevenue += dayFbRev;
      totalOtherRevenue += dayOtherRev;

      daily.push({
        date: dateStr,
        roomsSold: dayRoomsSold,
        occupancyPct: occPct,
        roomRevenue: dayRoomRev,
        fbRevenue: dayFbRev,
        otherRevenue: dayOtherRev,
        totalRevenue: dayTotal,
        adr,
        revpar,
        variancePct: variance,
      });
    }

    const availableRoomNights = totalRooms * numDays;
    const overallOccupancyPct = availableRoomNights > 0 ? Math.round((totalSoldRoomNights / availableRoomNights) * 1000) / 10 : 0;
    const overallAdr = totalSoldRoomNights > 0 ? Math.round(totalRoomRevenue / totalSoldRoomNights) : 0;
    const overallRevpar = availableRoomNights > 0 ? Math.round(totalRoomRevenue / availableRoomNights) : 0;
    const totalRevenue = totalRoomRevenue + totalFbRevenue + totalOtherRevenue;

    const sources = Array.from(sourceMap.entries()).map(([source, val]) => ({
      source,
      bookings: val.bookings,
      roomNights: val.roomNights,
      revenue: val.revenue,
      sharePct: totalRoomRevenue > 0 ? Math.round((val.revenue / totalRoomRevenue) * 1000) / 10 : 0,
    }));

    return {
      currency: hotel.currency,
      range: { from: from.toISOString(), to: to.toISOString(), days: numDays },
      summary: {
        totalRevenue,
        roomRevenue: totalRoomRevenue,
        fbRevenue: totalFbRevenue,
        otherRevenue: totalOtherRevenue,
        totalRooms,
        availableRoomNights,
        soldRoomNights: totalSoldRoomNights,
        occupancyPct: overallOccupancyPct,
        adr: overallAdr,
        revpar: overallRevpar,
      },
      bySource: sources,
      daily,
    };
  }

  async pastRevenueCsv(hotelId: string, from: Date, to: Date): Promise<string> {
    const report = await this.pastRevenue(hotelId, from, to);
    const lines = [
      'Date,Rooms Sold,Occupancy %,Room Revenue,F&B Revenue,Other Revenue,Total Revenue,ADR,RevPAR,Variance %',
    ];
    for (const d of report.daily) {
      lines.push(`${d.date},${d.roomsSold},${d.occupancyPct}%,${d.roomRevenue},${d.fbRevenue},${d.otherRevenue},${d.totalRevenue},${d.adr},${d.revpar},${d.variancePct}%`);
    }
    return lines.join('\n');
  }

  /**
   * Generate deterministic price suggestions for the next `horizonDays` per room
   * type, driven by projected occupancy, day-of-week and a simple seasonality
   * nudge. Replaces any still-pending (SUGGESTED) rows.
   */
  async generateSuggestions(actor: Actor, horizonDays = 14) {
    const hotelId = actor.hotelId;
    const roomTypes = await this.prisma.roomType.findMany({ where: { hotelId } });
    if (roomTypes.length === 0) {
      throw new BadRequestException('No room types to price');
    }

    await this.prisma.priceSuggestion.deleteMany({
      where: { hotelId, status: SuggestionStatus.SUGGESTED },
    });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const created: { roomTypeId: string; date: string; suggestedPrice: number; reason: string }[] = [];

    for (const rt of roomTypes) {
      const roomsOfType = await this.prisma.room.count({
        where: { hotelId, roomTypeId: rt.id, deletedAt: null },
      });
      for (let d = 1; d <= horizonDays; d++) {
        const date = new Date(start.getTime() + d * DAY_MS);
        const dayEnd = new Date(date.getTime() + DAY_MS);
        const booked = await this.prisma.reservation.count({
          where: {
            hotelId,
            roomTypeId: rt.id,
            status: { in: BLOCKING_RESERVATION_STATUSES as never },
            checkInDate: { lt: dayEnd },
            checkOutDate: { gt: date },
          },
        });
        const occ = roomsOfType > 0 ? booked / roomsOfType : 0;
        const dow = date.getDay(); // 0 Sun .. 6 Sat
        const isWeekend = dow === 5 || dow === 6;

        let factor = 1;
        const reasons: string[] = [];
        if (occ >= 0.8) {
          factor += 0.15;
          reasons.push('high demand (+15%)');
        } else if (occ < 0.4) {
          factor -= 0.1;
          reasons.push('low demand (−10%)');
        }
        if (isWeekend) {
          factor += 0.1;
          reasons.push('weekend (+10%)');
        }
        if (reasons.length === 0) reasons.push('baseline');

        const suggestedPrice = Math.round(rt.basePrice * factor);
        const reason = `Projected occupancy ${Math.round(occ * 100)}% · ${reasons.join(', ')}`;
        await this.prisma.priceSuggestion.create({
          data: {
            hotelId,
            roomTypeId: rt.id,
            date,
            suggestedPrice,
            reason,
            status: SuggestionStatus.SUGGESTED,
          },
        });
        created.push({ roomTypeId: rt.id, date: date.toISOString().slice(0, 10), suggestedPrice, reason });
      }
    }
    return { generated: created.length, suggestions: created };
  }

  listSuggestions(hotelId: string, status?: SuggestionStatus) {
    return this.prisma.priceSuggestion.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: [{ date: 'asc' }],
      take: 500,
    });
  }

  async decide(
    actor: Actor,
    id: string,
    decision: 'approve' | 'reject',
  ) {
    const s = await this.prisma.priceSuggestion.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!s) throw new NotFoundException('Suggestion not found');
    const status =
      decision === 'approve' ? SuggestionStatus.APPROVED : SuggestionStatus.REJECTED;
    const updated = await this.prisma.priceSuggestion.update({
      where: { id },
      data: { status, decidedById: actor.id },
    });
    await this.audit.record({
      actor,
      action: `price.${decision}`,
      entity: 'PriceSuggestion',
      entityId: id,
      before: s,
      after: updated,
    });
    return updated;
  }

  // ---- Pricing rules (plan.md §6.10, §11.12) ----
  createRule(
    actor: Actor,
    input: {
      roomTypeId: string;
      name: string;
      condition: Record<string, unknown>;
      adjustmentType: 'PERCENT' | 'FIXED';
      adjustmentValue: number;
      active?: boolean;
    },
  ) {
    return this.prisma.pricingRule.create({
      data: {
        hotelId: actor.hotelId,
        roomTypeId: input.roomTypeId,
        name: input.name,
        condition: input.condition as object,
        adjustmentType: input.adjustmentType,
        adjustmentValue: input.adjustmentValue,
        active: input.active ?? true,
      },
    });
  }

  listRules(hotelId: string) {
    return this.prisma.pricingRule.findMany({
      where: { hotelId },
      orderBy: { name: 'asc' },
    });
  }

  async setRuleActive(actor: Actor, id: string, active: boolean) {
    const rule = await this.prisma.pricingRule.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    return this.prisma.pricingRule.update({ where: { id }, data: { active } });
  }

  /** Apply an approved suggestion to that date in the rate calendar. */
  async apply(actor: Actor, id: string) {
    const s = await this.prisma.priceSuggestion.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!s) throw new NotFoundException('Suggestion not found');
    if (s.status !== SuggestionStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED suggestions can be applied');
    }
    await this.rates.setDay(actor.hotelId, s.roomTypeId, s.date, s.suggestedPrice);
    const updated = await this.prisma.priceSuggestion.update({
      where: { id },
      data: { status: SuggestionStatus.APPLIED },
    });
    await this.audit.record({
      actor,
      action: 'price.apply',
      entity: 'PriceSuggestion',
      entityId: id,
      after: { roomTypeId: s.roomTypeId, date: s.date, price: s.suggestedPrice },
    });
    return updated;
  }

  /**
   * AI revenue manager auto-pilot (plan.md §11.12): generate fresh suggestions
   * and apply them straight to the rate calendar (no human step). Returns count.
   */
  async autoApply(actor: Actor, horizonDays = 14) {
    await this.generateSuggestions(actor, horizonDays);
    const pending = await this.prisma.priceSuggestion.findMany({
      where: { hotelId: actor.hotelId, status: SuggestionStatus.SUGGESTED },
    });
    for (const s of pending) {
      await this.rates.setDay(actor.hotelId, s.roomTypeId, s.date, s.suggestedPrice);
      await this.prisma.priceSuggestion.update({ where: { id: s.id }, data: { status: SuggestionStatus.APPLIED } });
    }
    await this.audit.record({
      actor, action: 'price.auto_apply', entity: 'PriceSuggestion', entityId: actor.hotelId,
      after: { applied: pending.length, horizonDays },
    });
    return { applied: pending.length };
  }
}
