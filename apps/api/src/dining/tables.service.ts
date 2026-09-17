import { Injectable, NotFoundException } from '@nestjs/common';
import { TableStatus } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../common/actor';

/** Restaurant floor / table management (KitchenOS-inspired). */
@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    actor: Actor,
    input: { number: string; capacity: number; location?: string; notes?: string },
  ) {
    return this.prisma.floorTable.create({
      data: {
        hotelId: actor.hotelId,
        number: input.number,
        capacity: input.capacity,
        location: input.location ?? 'indoor',
        notes: input.notes,
      },
    });
  }

  list(hotelId: string) {
    return this.prisma.floorTable.findMany({
      where: { hotelId, active: true },
      orderBy: { number: 'asc' },
    });
  }

  /** Floor plan with live occupancy: open (unpaid) orders per table. */
  async floorPlan(hotelId: string) {
    const tables = await this.prisma.floorTable.findMany({
      where: { hotelId, active: true },
      orderBy: { number: 'asc' },
    });
    const openOrders = await this.prisma.order.findMany({
      where: { hotelId, tableId: { not: null }, status: { notIn: ['PAID', 'CANCELLED'] } },
      select: { tableId: true, id: true, total: true },
    });
    const byTable = new Map<string, { orders: number; total: number }>();
    for (const o of openOrders) {
      const cur = byTable.get(o.tableId!) ?? { orders: 0, total: 0 };
      cur.orders += 1;
      cur.total += o.total;
      byTable.set(o.tableId!, cur);
    }
    const seatedCapacity = tables
      .filter((t) => t.status === 'OCCUPIED')
      .reduce((s, t) => s + t.capacity, 0);
    const totalCapacity = tables.reduce((s, t) => s + t.capacity, 0);
    return {
      occupancyPct: totalCapacity > 0 ? Math.round((seatedCapacity / totalCapacity) * 100) : 0,
      tables: tables.map((t) => ({ ...t, openOrders: byTable.get(t.id) ?? { orders: 0, total: 0 } })),
    };
  }

  async update(
    actor: Actor,
    id: string,
    data: { status?: TableStatus; capacity?: number; location?: string; notes?: string },
  ) {
    const table = await this.prisma.floorTable.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!table) throw new NotFoundException('Table not found');
    return this.prisma.floorTable.update({ where: { id }, data });
  }

  async deactivate(actor: Actor, id: string) {
    await this.update(actor, id, {});
    return this.prisma.floorTable.update({ where: { id }, data: { active: false } });
  }

  /** Assign an open order to a table and mark the table occupied. */
  async assignOrder(actor: Actor, tableId: string, orderId: string) {
    const [table, order] = await Promise.all([
      this.prisma.floorTable.findFirst({ where: { id: tableId, hotelId: actor.hotelId } }),
      this.prisma.order.findFirst({ where: { id: orderId, hotelId: actor.hotelId } }),
    ]);
    if (!table) throw new NotFoundException('Table not found');
    if (!order) throw new NotFoundException('Order not found');
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: orderId }, data: { tableId } }),
      this.prisma.floorTable.update({ where: { id: tableId }, data: { status: TableStatus.OCCUPIED } }),
    ]);
    return { ok: true, tableId, orderId };
  }
}
