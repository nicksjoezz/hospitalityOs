import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvCategory, MovementType, Role } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface LossAlert {
  itemId: string;
  name: string;
  category: string;
  expectedQty: number;
  countedQty: number;
  variance: number; // expected - counted (positive = missing stock)
  variancePct: number;
  unit: string;
  probableCause: string;
  countedAt: string;
}

/** Default loss thresholds per category (% variance to flag). */
const THRESHOLD_PCT: Partial<Record<InvCategory, number>> = {
  [InvCategory.BEVERAGE_ALCOHOL]: 5,
  [InvCategory.FOOD]: 8,
};
const DEFAULT_THRESHOLD_PCT = 10;

/**
 * Loss / shrinkage detection (plan.md §11.7, §21). Compares theoretical (system)
 * stock against the latest physical count and flags variances beyond a
 * category threshold, with a probable-cause hint. Surfaces in the dashboard and
 * the GM chat.
 */
@Injectable()
export class LossService {
  private readonly logger = new Logger(LossService.name);

  constructor(private readonly prisma: PrismaService) {}

  private probableCause(category: string): string {
    switch (category) {
      case InvCategory.BEVERAGE_ALCOHOL:
        return 'overpour, unrecorded comps, or theft';
      case InvCategory.FOOD:
        return 'over-portioning, wastage, or theft';
      case InvCategory.TOILETRIES:
      case InvCategory.LINEN:
        return 'guest take / pilferage';
      default:
        return 'wastage or theft';
    }
  }

  /** Items whose latest physical count variance exceeds the category threshold. */
  async getAlerts(hotelId: string): Promise<LossAlert[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { hotelId },
      include: { counts: { orderBy: { at: 'desc' }, take: 1 } },
    });
    const alerts: LossAlert[] = [];
    for (const item of items) {
      const count = item.counts[0];
      if (!count) continue;
      const expected = Number(count.expectedQty);
      const counted = Number(count.countedQty);
      const variance = Number(count.variance);
      if (expected <= 0) continue;
      const pct = Math.abs(variance) / expected * 100;
      const threshold = THRESHOLD_PCT[item.category] ?? DEFAULT_THRESHOLD_PCT;
      if (pct >= threshold && variance > 0) {
        alerts.push({
          itemId: item.id,
          name: item.name,
          category: item.category,
          expectedQty: expected,
          countedQty: counted,
          variance,
          variancePct: Math.round(pct * 10) / 10,
          unit: item.unit,
          probableCause: this.probableCause(item.category),
          countedAt: count.at.toISOString(),
        });
      }
    }
    return alerts.sort((a, b) => b.variancePct - a.variancePct);
  }

  /**
   * Theoretical vs actual usage over a period for one item (plan.md §11.7):
   * theoretical = sales + pours + wastage depletion; actual = opening + purchases − closing.
   */
  async computeUsage(hotelId: string, itemId: string, from: Date, to: Date) {
    const moves = await this.prisma.stockMovement.findMany({
      where: { hotelId, itemId, at: { gte: from, lte: to } },
    });
    let purchases = 0;
    let theoretical = 0; // depletion attributable to sales/pours/wastage
    for (const m of moves) {
      const q = Number(m.quantity);
      if (m.type === MovementType.PURCHASE_IN) purchases += q;
      if (
        m.type === MovementType.SALE_OUT ||
        m.type === MovementType.WASTAGE
      ) {
        theoretical += Math.abs(q);
      }
    }
    const pours = await this.prisma.pourLog.findMany({
      where: { hotelId, inventoryItemId: itemId, at: { gte: from, lte: to } },
    });
    const pourTotal = pours.reduce((s, p) => s + Number(p.quantity), 0);
    theoretical += pourTotal;
    return { itemId, purchases, theoreticalUsage: theoretical };
  }

  /** Nightly loss sweep → managers/owner notifications (deduped by count). */
  @Cron('0 30 2 * * *')
  async nightlySweep(): Promise<void> {
    const hotels = await this.prisma.hotel.findMany({ select: { id: true } });
    for (const { id: hotelId } of hotels) {
      const alerts = await this.getAlerts(hotelId);
      for (const a of alerts) {
        const ref = `${a.itemId}:${a.countedAt}`;
        const exists = await this.prisma.notification.findFirst({
          where: { type: 'inventory.loss', entityRef: ref },
        });
        if (exists) continue;
        await this.prisma.notification.create({
          data: {
            hotelId,
            role: Role.MANAGER,
            type: 'inventory.loss',
            title: `Possible loss: ${a.name} (${a.variancePct}% below expected)`,
            body: `Missing ${a.variance} ${a.unit} — ${a.probableCause}`,
            entityRef: ref,
          },
        });
        this.logger.warn(`Loss alert: ${a.name} ${a.variancePct}% at hotel ${hotelId}`);
      }
    }
  }
}
