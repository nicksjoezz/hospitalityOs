import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function nights(checkIn: Date, checkOut: Date): number {
  const dIn = Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate());
  const dOut = Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate());
  return Math.max(1, Math.round((dOut - dIn) / DAY));
}

export interface QuoteResult {
  nights: number;
  total: number;
  currency: string;
  nightly: { date: string; price: number }[];
  blocked: boolean;
  reason?: string;
}

/**
 * Resolves the nightly price for a stay (plan.md §11.12): per-day rate calendar
 * override → rate-plan adjustment → room-type base price, and enforces stay
 * restrictions (min/max stay, closed-to-arrival, stop-sell).
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(
    hotelId: string,
    roomTypeId: string,
    checkIn: Date,
    checkOut: Date,
    ratePlanId?: string,
  ): Promise<QuoteResult> {
    const roomType = await this.prisma.roomType.findFirst({ where: { id: roomTypeId, hotelId } });
    if (!roomType) throw new NotFoundException('Room type not found');
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { currency: true },
    });
    const ratePlan = ratePlanId
      ? await this.prisma.ratePlan.findFirst({ where: { id: ratePlanId, hotelId, active: true } })
      : null;

    const n = nights(checkIn, checkOut);
    const checkInStart = new Date(Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate()));
    const dailyRates = await this.prisma.dailyRate.findMany({
      where: { hotelId, roomTypeId, date: { gte: checkInStart, lt: checkOut } },
    });
    const byDay = new Map(dailyRates.map((r) => [dayKey(r.date), r]));

    const applyPlan = (price: number): number => {
      if (!ratePlan) return price;
      switch (ratePlan.adjustmentType) {
        case 'ABSOLUTE':
          return ratePlan.adjustmentValue;
        case 'FIXED':
          return Math.max(0, price + ratePlan.adjustmentValue);
        default: // PERCENT (whole %, may be negative)
          return Math.max(0, Math.round(price * (1 + ratePlan.adjustmentValue / 100)));
      }
    };

    const nightly: { date: string; price: number }[] = [];
    let blocked = false;
    let reason: string | undefined;
    for (let i = 0; i < n; i++) {
      const d = new Date(checkInStart.getTime() + i * DAY);
      const key = dayKey(d);
      const dr = byDay.get(key);
      const base = dr?.price ?? roomType.basePrice;
      const price = applyPlan(base);
      nightly.push({ date: key, price });
      if (dr?.stopSell) {
        blocked = true;
        reason = `Stop-sell on ${key}`;
      }
      if (i === 0 && dr?.closedToArrival) {
        blocked = true;
        reason = `Closed to arrival on ${key}`;
      }
      if (i === 0 && dr?.minStay && n < dr.minStay) {
        blocked = true;
        reason = `Minimum stay ${dr.minStay} nights`;
      }
      if (i === 0 && dr?.maxStay && n > dr.maxStay) {
        blocked = true;
        reason = `Maximum stay ${dr.maxStay} nights`;
      }
    }

    return {
      nights: n,
      total: nightly.reduce((s, x) => s + x.price, 0),
      currency: hotel.currency,
      nightly,
      blocked,
      reason,
    };
  }
}
