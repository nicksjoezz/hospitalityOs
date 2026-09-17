import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovementType, POStatus, QuoteStatus } from '@hospitalityos/shared';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { AnthropicService } from '../ai/anthropic.service';
import { can } from '../common/policy';
import { Actor } from '../common/actor';

export interface POItem {
  inventoryItemId?: string;
  name: string;
  quantity: number;
  unitCost: number; // minor units
}

/**
 * Procurement (plan.md §11.8). Suppliers, quotations, and purchase orders that
 * flow DRAFT → PENDING_APPROVAL → APPROVED → SENT → RECEIVED. AI may draft a PO
 * (e.g. from low stock) but sending requires human approval. Receiving posts
 * PURCHASE_IN stock movements.
 */
@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly anthropic: AnthropicService,
  ) {}

  // ---- Suppliers ----
  createSupplier(
    actor: Actor,
    input: { name: string; phone: string; email?: string; categories?: string[] },
  ) {
    return this.prisma.supplier.create({
      data: {
        hotelId: actor.hotelId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        categories: input.categories ?? [],
      },
    });
  }

  listSuppliers(hotelId: string) {
    return this.prisma.supplier.findMany({ where: { hotelId }, orderBy: { name: 'asc' } });
  }

  // ---- Quotations ----
  recordQuotation(
    actor: Actor,
    input: { supplierId: string; items: POItem[]; validUntil?: Date },
  ) {
    const total = input.items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
    return this.prisma.quotation.create({
      data: {
        hotelId: actor.hotelId,
        supplierId: input.supplierId,
        items: input.items as object,
        total,
        validUntil: input.validUntil,
        status: QuoteStatus.RECEIVED,
      },
    });
  }

  listQuotations(hotelId: string, supplierId?: string) {
    return this.prisma.quotation.findMany({
      where: { hotelId, ...(supplierId ? { supplierId } : {}) },
      orderBy: { at: 'desc' },
      take: 200,
    });
  }

  /** Compare supplier quotes per item; cheapest first (plan.md §11.8). */
  async compareQuotations(hotelId: string) {
    const quotations = await this.prisma.quotation.findMany({
      where: { hotelId },
      include: { supplier: { select: { name: true } } },
    });
    const byItem: Record<
      string,
      { supplierId: string; supplier: string; unitCost: number; quotationId: string }[]
    > = {};
    for (const q of quotations) {
      const items = (q.items as unknown as POItem[]) ?? [];
      for (const it of items) {
        (byItem[it.name] ??= []).push({
          supplierId: q.supplierId,
          supplier: q.supplier.name,
          unitCost: it.unitCost,
          quotationId: q.id,
        });
      }
    }
    return Object.entries(byItem).map(([name, offers]) => ({
      item: name,
      offers: offers.sort((a, b) => a.unitCost - b.unitCost),
      cheapest: offers.sort((a, b) => a.unitCost - b.unitCost)[0],
    }));
  }

  /** AI-draft a supplier WhatsApp/email message for approval (plan.md §11.8). */
  async draftSupplierMessage(actor: Actor, supplierId: string, brief: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, hotelId: actor.hotelId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: actor.hotelId },
      select: { name: true },
    });
    if (!this.anthropic.isConfigured()) {
      return {
        draft: `Hello ${supplier.name}, this is ${hotel.name}. ${brief} Please share availability, pricing and delivery time. Thank you.`,
      };
    }
    const resp = await this.anthropic.createMessage({
      tier: 'cheap',
      system: `Write a short, professional message from ${hotel.name} to its supplier "${supplier.name}". Clear and courteous, requesting what is described. No markdown.`,
      messages: [{ role: 'user', content: brief }],
      maxTokens: 250,
    });
    const draft = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
    return { draft: draft || brief };
  }

  // ---- Purchase orders ----
  async draftPO(
    actor: Actor,
    input: { supplierId: string; items: POItem[]; note?: string },
  ) {
    if (input.items.length === 0) throw new BadRequestException('PO needs items');
    const total = input.items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
    const po = await this.prisma.purchaseOrder.create({
      data: {
        hotelId: actor.hotelId,
        supplierId: input.supplierId,
        items: input.items as object,
        total,
        status: POStatus.DRAFT,
        draftedById: actor.id ?? 'system',
        draftedByType: actor.type,
        note: input.note,
      },
    });
    await this.audit.record({
      actor,
      action: 'po.draft',
      entity: 'PurchaseOrder',
      entityId: po.id,
      after: { id: po.id, total, status: po.status },
    });
    return po;
  }

  /** Build a draft PO from items at/below reorder point (AI-draftable). */
  async draftFromLowStock(actor: Actor, supplierId: string) {
    const low = await this.prisma.inventoryItem.findMany({
      where: { hotelId: actor.hotelId },
    });
    const items: POItem[] = low
      .filter((i) => Number(i.currentQty) <= Number(i.reorderPoint))
      .map((i) => ({
        inventoryItemId: i.id,
        name: i.name,
        quantity: Math.max(Number(i.parLevel) - Number(i.currentQty), 1),
        unitCost: i.costPerUnit,
      }));
    if (items.length === 0) {
      throw new BadRequestException('No items are at or below reorder point');
    }
    return this.draftPO(actor, { supplierId, items, note: 'Auto-drafted from low stock' });
  }

  async submitForApproval(actor: Actor, poId: string) {
    const po = await this.getPO(actor.hotelId, poId);
    if (po.status !== POStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT POs can be submitted');
    }
    return this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: POStatus.PENDING_APPROVAL },
    });
  }

  async approve(actor: Actor, poId: string) {
    if (!can({ role: actor.role!, extraPermissions: [] }, 'po:approve')) {
      throw new ForbiddenException('Not permitted to approve purchase orders');
    }
    const po = await this.getPO(actor.hotelId, poId);
    if (po.status !== POStatus.PENDING_APPROVAL && po.status !== POStatus.DRAFT) {
      throw new BadRequestException('PO is not awaiting approval');
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: POStatus.APPROVED, approvedById: actor.id, approvedAt: new Date() },
    });
    await this.audit.record({
      actor,
      action: 'po.approve',
      entity: 'PurchaseOrder',
      entityId: poId,
      after: { status: updated.status },
    });
    return updated;
  }

  async send(actor: Actor, poId: string) {
    const po = await this.getPO(actor.hotelId, poId);
    if (po.status !== POStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED POs can be sent');
    }
    return this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: POStatus.SENT },
    });
  }

  /** Receive a delivery → PURCHASE_IN movements for items linked to inventory. */
  async receive(actor: Actor, poId: string, partial = false) {
    const po = await this.getPO(actor.hotelId, poId);
    const receivable: POStatus[] = [
      POStatus.SENT,
      POStatus.APPROVED,
      POStatus.PARTIALLY_RECEIVED,
    ];
    if (!receivable.includes(po.status as POStatus)) {
      throw new BadRequestException(`Cannot receive a ${po.status} PO`);
    }
    const items = (po.items as unknown as POItem[]) ?? [];
    for (const item of items) {
      if (item.inventoryItemId) {
        await this.inventory.move(actor, {
          itemId: item.inventoryItemId,
          type: MovementType.PURCHASE_IN,
          quantity: item.quantity,
          reason: `PO ${po.id.slice(0, 8)} received`,
          refType: 'PurchaseOrder',
          refId: po.id,
        });
      }
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: partial ? POStatus.PARTIALLY_RECEIVED : POStatus.RECEIVED,
        receivedAt: partial ? po.receivedAt : new Date(),
      },
    });
    await this.audit.record({
      actor,
      action: 'po.receive',
      entity: 'PurchaseOrder',
      entityId: poId,
      after: { status: updated.status },
    });
    return updated;
  }

  listPOs(hotelId: string, status?: POStatus) {
    return this.prisma.purchaseOrder.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getPO(hotelId: string, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, hotelId },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }
}
