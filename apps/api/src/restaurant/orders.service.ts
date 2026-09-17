import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DomainEvents,
  LineType,
  MovementType,
  Outlet,
  OrderStatus,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { EventBusService } from '../common/event-bus.service';
import { InventoryService } from '../inventory/inventory.service';
import { Actor } from '../common/actor';

export interface OrderLineInput {
  menuItemId: string;
  quantity: number;
}

/**
 * POS orders for all outlets (plan.md §11.4–§11.5). Selling depletes recipe
 * ingredients (theoretical usage); room/reservation orders post to the folio.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Route an order to its prep stations (plan.md §11.4–§11.5). Food lines go to
   * the KITCHEN display, drink lines to the BAR display — bar is handled
   * separately from the kitchen. Each station only sees its own lines.
   */
  private async emitStations(hotelId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lines: {
          include: {
            menuItem: { select: { name: true, category: { select: { outlet: true } } } },
          },
        },
      },
    });
    if (!order) return;

    const active = order.lines.filter((l) => !l.voided);
    const stationOf = (outlet: string) => (outlet === Outlet.BAR ? 'bar' : 'kitchen');
    const stations: Record<'kitchen' | 'bar', { name: string; quantity: number }[]> = {
      kitchen: [],
      bar: [],
    };
    for (const l of active) {
      const st = stationOf(l.menuItem.category.outlet);
      stations[st].push({ name: l.menuItem.name, quantity: l.quantity });
    }

    for (const station of ['kitchen', 'bar'] as const) {
      if (stations[station].length === 0) continue;
      await this.events.emit(DomainEvents.KitchenOrderUpdate, {
        hotelId,
        station,
        order: {
          id: order.id,
          outlet: order.outlet,
          status: order.status,
          tableNo: order.tableNo,
          total: order.total,
          at: order.at.toISOString(),
          lines: stations[station],
        },
      });
    }
  }

  /** Kitchen status transition (PREPARING / SERVED) for the KDS. */
  async setStatus(actor: Actor, orderId: string, status: OrderStatus) {
    const order = await this.getOrder(actor.hotelId, orderId);
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status },
    });
    await this.emitStations(actor.hotelId, orderId);
    return updated;
  }

  async create(
    actor: Actor,
    input: {
      outlet: Outlet;
      lines: OrderLineInput[];
      tableNo?: string;
      roomId?: string;
      reservationId?: string;
      note?: string;
    },
  ) {
    if (input.lines.length === 0) {
      throw new BadRequestException('An order needs at least one line');
    }
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        hotelId: actor.hotelId,
        id: { in: input.lines.map((l) => l.menuItemId) },
      },
    });
    const priceOf = new Map(menuItems.map((m) => [m.id, m]));
    for (const l of input.lines) {
      if (!priceOf.has(l.menuItemId)) {
        throw new NotFoundException(`Menu item ${l.menuItemId} not found`);
      }
    }
    const lineData = input.lines.map((l) => {
      const item = priceOf.get(l.menuItemId)!;
      const lineTotal = item.price * l.quantity;
      return {
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        unitPrice: item.price,
        lineTotal,
      };
    });
    const total = lineData.reduce((s, l) => s + l.lineTotal, 0);

    let reservationId = input.reservationId;
    if (!reservationId && input.roomId) {
      const activeRes = await this.prisma.reservation.findFirst({
        where: {
          hotelId: actor.hotelId,
          roomId: input.roomId,
          status: 'CHECKED_IN',
        },
        select: { id: true },
      });
      reservationId = activeRes?.id;
    }

    const order = await this.prisma.order.create({
      data: {
        hotelId: actor.hotelId,
        outlet: input.outlet,
        tableNo: input.tableNo,
        roomId: input.roomId,
        reservationId,
        status: OrderStatus.OPEN,
        total,
        createdById: actor.id ?? 'system',
        note: input.note,
        lines: { create: lineData },
      },
      include: { lines: true },
    });
    await this.audit.record({
      actor,
      action: 'order.create',
      entity: 'Order',
      entityId: order.id,
      after: { id: order.id, outlet: order.outlet, total },
    });
    await this.emitStations(actor.hotelId, order.id);
    return order;
  }

  /** Send to kitchen and deplete recipe ingredients (theoretical usage). */
  async sendToKitchen(actor: Actor, orderId: string) {
    const order = await this.getOrder(actor.hotelId, orderId);
    if (order.status !== OrderStatus.OPEN) {
      throw new BadRequestException(`Order is ${order.status}, cannot send`);
    }
    for (const line of order.lines) {
      if (line.voided) continue;
      const menuItem = await this.prisma.menuItem.findUnique({
        where: { id: line.menuItemId },
        include: { recipe: { include: { ingredients: true } } },
      });
      const ingredients = menuItem?.recipe?.ingredients ?? [];
      for (const ing of ingredients) {
        await this.inventory.move(actor, {
          itemId: ing.inventoryItemId,
          type: MovementType.SALE_OUT,
          quantity: Number(ing.quantity) * line.quantity,
          reason: `Sold: ${menuItem?.name}`,
          refType: 'OrderLine',
          refId: line.id,
        });
      }
    }
    const sent = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.SENT_TO_KITCHEN },
    });
    await this.emitStations(actor.hotelId, orderId);
    return sent;
  }

  async voidLine(actor: Actor, orderId: string, lineId: string, reason: string) {
    const order = await this.getOrder(actor.hotelId, orderId);
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Order line not found');
    if (line.voided) return line;
    const [updatedLine] = await this.prisma.$transaction([
      this.prisma.orderLine.update({
        where: { id: lineId },
        data: { voided: true, voidReason: reason },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { total: order.total - line.lineTotal },
      }),
    ]);
    await this.audit.record({
      actor,
      action: 'order.void_line',
      entity: 'OrderLine',
      entityId: lineId,
      before: line,
      after: { voided: true, reason },
    });
    return updatedLine;
  }

  /**
   * Settle the order. If tied to a reservation, post the total to its folio as a
   * line item; otherwise mark PAID directly (counter sale).
   */
  async pay(actor: Actor, orderId: string) {
    const order = await this.getOrder(actor.hotelId, orderId);
    if (order.status === OrderStatus.PAID) return order;

    if (order.reservationId) {
      const folio = await this.prisma.folio.findFirst({
        where: { reservationId: order.reservationId },
      });
      if (!folio) throw new BadRequestException('Reservation folio not found');
      const lineType = order.outlet === Outlet.BAR ? LineType.BAR : LineType.FNB;
      await this.prisma.$transaction([
        this.prisma.folioLineItem.create({
          data: {
            folioId: folio.id,
            type: lineType,
            description: `${order.outlet} order ${order.id.slice(0, 8)}`,
            amount: order.total,
            quantity: 1,
            by: actor.id,
          },
        }),
        this.prisma.folio.update({
          where: { id: folio.id },
          data: {
            totalCharges: folio.totalCharges + order.total,
            balance: folio.balance + order.total,
          },
        }),
      ]);
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
    });
  }

  async getOrder(hotelId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, hotelId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  list(hotelId: string, outlet?: Outlet, status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: { hotelId, ...(outlet ? { outlet } : {}), ...(status ? { status } : {}) },
      include: { lines: true },
      orderBy: { at: 'desc' },
      take: 200,
    });
  }

  /**
   * Active tickets for a prep station (kitchen or bar). Returns only the lines
   * belonging to that station, so the bar never sees food and vice-versa.
   */
  async activeTickets(hotelId: string, station: 'kitchen' | 'bar') {
    const orders = await this.prisma.order.findMany({
      where: { hotelId, status: { in: [OrderStatus.OPEN, OrderStatus.SENT_TO_KITCHEN, OrderStatus.PREPARING] } },
      include: {
        lines: { include: { menuItem: { select: { name: true, category: { select: { outlet: true } } } } } },
      },
      orderBy: { at: 'asc' },
    });
    return orders
      .map((o) => ({
        id: o.id,
        outlet: o.outlet,
        status: o.status,
        tableNo: o.tableNo,
        total: o.total,
        at: o.at.toISOString(),
        lines: o.lines
          .filter((l) => !l.voided)
          .filter((l) => (l.menuItem.category.outlet === Outlet.BAR ? 'bar' : 'kitchen') === station)
          .map((l) => ({ name: l.menuItem.name, quantity: l.quantity })),
      }))
      .filter((o) => o.lines.length > 0);
  }

  /** Order analytics: top items, by-channel, by-status (KitchenOS-inspired). */
  async analytics(hotelId: string, from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: { hotelId, at: { gte: from, lte: to } },
      include: { lines: { include: { menuItem: { select: { name: true } } } } },
    });
    const itemQty: Record<string, { name: string; quantity: number; revenue: number }> = {};
    const byChannel: Record<string, { orders: number; revenue: number }> = {};
    const byStatus: Record<string, number> = {};
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      const ch = byChannel[o.channel] ?? { orders: 0, revenue: 0 };
      ch.orders += 1;
      ch.revenue += o.total;
      byChannel[o.channel] = ch;
      for (const l of o.lines) {
        if (l.voided) continue;
        const cur = itemQty[l.menuItemId] ?? { name: l.menuItem.name, quantity: 0, revenue: 0 };
        cur.quantity += l.quantity;
        cur.revenue += l.lineTotal;
        itemQty[l.menuItemId] = cur;
      }
    }
    const topItems = Object.values(itemQty)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
    return { from: from.toISOString(), to: to.toISOString(), topItems, byChannel, byStatus };
  }

  /** Daily food-cost %: ingredient cost of sold dishes ÷ sales (plan.md §11.4). */
  async foodCost(hotelId: string, from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        hotelId,
        outlet: { in: [Outlet.RESTAURANT, Outlet.ROOM_SERVICE] },
        status: { in: [OrderStatus.SERVED, OrderStatus.PAID] },
        at: { gte: from, lte: to },
      },
      include: { lines: true },
    });
    let sales = 0;
    let cost = 0;
    for (const order of orders) {
      for (const line of order.lines) {
        if (line.voided) continue;
        sales += line.lineTotal;
        const menuItem = await this.prisma.menuItem.findUnique({
          where: { id: line.menuItemId },
          include: { recipe: { include: { ingredients: { include: { inventoryItem: true } } } } },
        });
        const ings = menuItem?.recipe?.ingredients ?? [];
        for (const ing of ings) {
          cost += Number(ing.quantity) * line.quantity * ing.inventoryItem.costPerUnit;
        }
      }
    }
    const foodCostPct = sales > 0 ? Math.round((cost / sales) * 1000) / 10 : null;
    return { from, to, sales, theoreticalCost: cost, foodCostPct };
  }
}
