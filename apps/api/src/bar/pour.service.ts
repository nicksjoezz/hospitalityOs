import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MovementType } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { Actor } from '../common/actor';

/**
 * Bar pour logging (plan.md §11.5). Logging a pour decrements the alcohol item
 * (the actual stock effect) and records a PourLog for bar-level tracking and
 * theoretical-vs-actual variance.
 */
@Injectable()
export class PourService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async logPour(
    actor: Actor,
    input: {
      inventoryItemId: string;
      quantity: number;
      unit: string;
      orderLineId?: string;
    },
  ) {
    const pour = await this.prisma.pourLog.create({
      data: {
        hotelId: actor.hotelId,
        inventoryItemId: input.inventoryItemId,
        quantity: new Prisma.Decimal(input.quantity),
        unit: input.unit,
        orderLineId: input.orderLineId,
        byId: actor.id ?? 'system',
      },
    });
    // The pour is the actual stock decrement.
    await this.inventory.move(actor, {
      itemId: input.inventoryItemId,
      type: MovementType.SALE_OUT,
      quantity: input.quantity,
      reason: 'Bar pour',
      refType: 'PourLog',
      refId: pour.id,
    });
    return pour;
  }

  /** Pour totals per item over a period (for overpour/variance review). */
  async poursReport(hotelId: string, from: Date, to: Date) {
    const pours = await this.prisma.pourLog.findMany({
      where: { hotelId, at: { gte: from, lte: to } },
      include: { inventoryItem: true },
    });
    const byItem = new Map<string, { name: string; unit: string; total: number; count: number }>();
    for (const p of pours) {
      const cur = byItem.get(p.inventoryItemId) ?? {
        name: p.inventoryItem.name,
        unit: p.unit,
        total: 0,
        count: 0,
      };
      cur.total += Number(p.quantity);
      cur.count += 1;
      byItem.set(p.inventoryItemId, cur);
    }
    return {
      from,
      to,
      items: [...byItem.entries()].map(([itemId, v]) => ({ itemId, ...v })),
    };
  }
}
