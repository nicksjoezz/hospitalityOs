import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DomainEvents,
  InvCategory,
  MovementType,
  Role,
} from '@hospitalityos/shared';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../common/event-bus.service';
import { AuditService } from '../common/audit.service';
import { AnthropicService } from '../ai/anthropic.service';
import { Actor } from '../common/actor';

/** Depleting movement types (consume stock). */
const DEPLETING: MovementType[] = [MovementType.SALE_OUT, MovementType.WASTAGE];

/**
 * Unified inventory across the hotel, kitchen and bar (plan.md §6.7, §11.6).
 * Every quantity change is a signed StockMovement; currentQty is kept in sync.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly anthropic: AnthropicService,
  ) {}

  /** Waste report: WASTAGE movements grouped by item and reason, costed. */
  async wasteReport(hotelId: string, from: Date, to: Date) {
    const moves = await this.prisma.stockMovement.findMany({
      where: { hotelId, type: MovementType.WASTAGE, at: { gte: from, lte: to } },
      include: { item: { select: { name: true, costPerUnit: true, unit: true } } },
    });
    const byItem: Record<string, { name: string; quantity: number; cost: number; unit: string }> = {};
    const byReason: Record<string, { count: number; cost: number }> = {};
    let totalCost = 0;
    for (const m of moves) {
      const qty = Math.abs(Number(m.quantity));
      const cost = Math.round(qty * m.item.costPerUnit);
      totalCost += cost;
      const it = byItem[m.itemId] ?? { name: m.item.name, quantity: 0, cost: 0, unit: m.item.unit };
      it.quantity += qty;
      it.cost += cost;
      byItem[m.itemId] = it;
      const reason = m.reason ?? 'unspecified';
      const r = byReason[reason] ?? { count: 0, cost: 0 };
      r.count += 1;
      r.cost += cost;
      byReason[reason] = r;
    }
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalCost,
      byItem: Object.values(byItem).sort((a, b) => b.cost - a.cost),
      byReason,
    };
  }

  /** AI cost-reduction insights from the waste report (heuristic fallback). */
  async wasteInsights(hotelId: string, from: Date, to: Date) {
    const report = await this.wasteReport(hotelId, from, to);
    if (!this.anthropic.isConfigured() || report.byItem.length === 0) {
      const top = report.byItem[0];
      return {
        report,
        insight: top
          ? `Top waste: ${top.name} (${top.quantity} ${top.unit}). Review portioning, par levels and storage to cut loss.`
          : 'No wastage recorded in this period.',
      };
    }
    const resp = await this.anthropic.createMessage({
      tier: 'cheap',
      system:
        'You are a restaurant cost controller. Given a waste report (JSON), give 2-3 concise, actionable cost-reduction recommendations. No markdown.',
      messages: [{ role: 'user', content: JSON.stringify(report) }],
      maxTokens: 300,
    });
    const insight = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
    return { report, insight };
  }

  createItem(
    actor: Actor,
    input: {
      name: string;
      category: InvCategory;
      unit: string;
      sku?: string;
      currentQty?: number;
      parLevel?: number;
      reorderPoint?: number;
      costPerUnit?: number;
      perishable?: boolean;
      location?: string;
    },
  ) {
    return this.prisma.inventoryItem.create({
      data: {
        hotelId: actor.hotelId,
        name: input.name,
        category: input.category,
        unit: input.unit,
        sku: input.sku,
        currentQty: input.currentQty ?? 0,
        parLevel: input.parLevel ?? 0,
        reorderPoint: input.reorderPoint ?? 0,
        costPerUnit: input.costPerUnit ?? 0,
        perishable: input.perishable ?? false,
        location: input.location,
      },
    });
  }

  list(hotelId: string, category?: InvCategory) {
    return this.prisma.inventoryItem.findMany({
      where: { hotelId, ...(category ? { category } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async get(hotelId: string, itemId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, hotelId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  /**
   * Record a signed stock movement and adjust currentQty atomically. `quantity`
   * is the magnitude; the sign is derived from the movement type (purchases add,
   * sales/wastage subtract). ADJUSTMENT/TRANSFER/COUNT_CORRECTION take an explicit
   * signed `delta`.
   */
  async move(
    actor: Actor,
    params: {
      itemId: string;
      type: MovementType;
      quantity: number; // magnitude for typed moves, or signed for ADJUSTMENT/TRANSFER/COUNT_CORRECTION
      reason?: string;
      refType?: string;
      refId?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const item = await client.inventoryItem.findFirst({
      where: { id: params.itemId, hotelId: actor.hotelId },
    });
    if (!item) throw new NotFoundException('Inventory item not found');

    const delta = this.signedDelta(params.type, params.quantity);
    const before = Number(item.currentQty);
    const after = before + delta;

    await client.stockMovement.create({
      data: {
        hotelId: actor.hotelId,
        itemId: params.itemId,
        type: params.type,
        quantity: new Prisma.Decimal(delta),
        unit: item.unit,
        reason: params.reason,
        refType: params.refType,
        refId: params.refId,
        byId: actor.id ?? 'system',
        byType: actor.type,
      },
    });
    await client.inventoryItem.update({
      where: { id: params.itemId },
      data: { currentQty: new Prisma.Decimal(after) },
    });

    // Low-stock signal when a depleting move crosses the reorder point.
    if (
      DEPLETING.includes(params.type) &&
      after <= Number(item.reorderPoint) &&
      before > Number(item.reorderPoint)
    ) {
      await this.events.emit(DomainEvents.InventoryItemLowStock, {
        hotelId: actor.hotelId,
        itemId: item.id,
        name: item.name,
        currentQty: after,
        reorderPoint: Number(item.reorderPoint),
      });
      await (tx ?? this.prisma).notification.create({
        data: {
          hotelId: actor.hotelId,
          role: Role.PROCUREMENT,
          type: 'inventory.low_stock',
          title: `Low stock: ${item.name}`,
          body: `${after} ${item.unit} left (reorder at ${item.reorderPoint})`,
          entityRef: item.id,
        },
      });
    }
    return { itemId: item.id, currentQty: after };
  }

  private signedDelta(type: MovementType, quantity: number): number {
    switch (type) {
      case MovementType.PURCHASE_IN:
        return Math.abs(quantity);
      case MovementType.SALE_OUT:
      case MovementType.WASTAGE:
        return -Math.abs(quantity);
      default:
        return quantity; // ADJUSTMENT / TRANSFER / COUNT_CORRECTION: caller-signed
    }
  }

  async logWastage(actor: Actor, itemId: string, quantity: number, reason: string) {
    return this.move(actor, {
      itemId,
      type: MovementType.WASTAGE,
      quantity,
      reason,
    });
  }

  /**
   * Physical count → variance vs expected (system) qty, then correct currentQty
   * (plan.md §11.6). variance = expected − counted (positive = shrinkage).
   */
  async recordCount(actor: Actor, itemId: string, countedQty: number, note?: string) {
    const item = await this.get(actor.hotelId, itemId);
    const expectedQty = Number(item.currentQty);
    const variance = expectedQty - countedQty;

    const count = await this.prisma.$transaction(async (tx) => {
      const c = await tx.stockCount.create({
        data: {
          hotelId: actor.hotelId,
          itemId,
          countedQty: new Prisma.Decimal(countedQty),
          expectedQty: new Prisma.Decimal(expectedQty),
          variance: new Prisma.Decimal(variance),
          countedById: actor.id ?? 'system',
          note,
        },
      });
      // Correct the book quantity to the physical count.
      if (variance !== 0) {
        await this.move(
          actor,
          {
            itemId,
            type: MovementType.COUNT_CORRECTION,
            quantity: -variance, // delta to move from expected to counted
            reason: `Stock count correction (variance ${variance})`,
            refType: 'StockCount',
            refId: c.id,
          },
          tx,
        );
      }
      await this.audit.record(
        {
          actor,
          action: 'inventory.count',
          entity: 'StockCount',
          entityId: c.id,
          after: { itemId, expectedQty, countedQty, variance },
        },
        tx,
      );
      return c;
    });
    return { ...count, expectedQty, variance };
  }

  lowStock(hotelId: string) {
    return this.prisma.$queryRaw<
      Array<{ id: string; name: string; currentQty: number; reorderPoint: number }>
    >`SELECT id, name, "currentQty", "reorderPoint" FROM "InventoryItem"
       WHERE "hotelId" = ${hotelId} AND "currentQty" <= "reorderPoint" ORDER BY name`;
  }

  /**
   * Simple depletion forecast: average daily consumption (depleting movements)
   * over the last `days` → estimated days of stock remaining (plan.md §11.6).
   */
  async forecast(hotelId: string, itemId: string, days = 30) {
    const item = await this.get(hotelId, itemId);
    const since = new Date(Date.now() - days * 86400_000);
    const moves = await this.prisma.stockMovement.findMany({
      where: {
        hotelId,
        itemId,
        type: { in: DEPLETING },
        at: { gte: since },
      },
    });
    const consumed = moves.reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);
    const perDay = consumed / days;
    const daysRemaining = perDay > 0 ? Number(item.currentQty) / perDay : null;
    return {
      itemId,
      name: item.name,
      currentQty: Number(item.currentQty),
      avgDailyConsumption: Math.round(perDay * 100) / 100,
      daysRemaining: daysRemaining === null ? null : Math.round(daysRemaining * 10) / 10,
    };
  }
}
