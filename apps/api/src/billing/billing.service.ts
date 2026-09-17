import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMoney, InvoiceStatus, TaxKind } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { buildPdf } from '../reports/pdf.util';
import { Actor } from '../common/actor';

interface InvoiceLine {
  description: string;
  amount: number;
  quantity: number;
}

/** Tax configuration, invoicing and city ledger / company AR (plan.md §6.3, §13). */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Tax rates ----
  createTax(actor: Actor, input: { name: string; kind: TaxKind; percentBps: number; inclusive?: boolean }) {
    return this.prisma.taxRate.create({
      data: { hotelId: actor.hotelId, name: input.name, kind: input.kind, percentBps: input.percentBps, inclusive: input.inclusive ?? false },
    });
  }
  listTaxes(hotelId: string) {
    return this.prisma.taxRate.findMany({ where: { hotelId }, orderBy: { name: 'asc' } });
  }

  /** Compute tax lines for a (net) amount from the active tax rates. */
  async computeTaxes(hotelId: string, netAmount: number) {
    const taxes = await this.prisma.taxRate.findMany({ where: { hotelId, active: true } });
    const lines: InvoiceLine[] = [];
    let taxTotal = 0;
    for (const t of taxes) {
      const amount = t.inclusive
        ? Math.round(netAmount - netAmount / (1 + t.percentBps / 10000))
        : Math.round((netAmount * t.percentBps) / 10000);
      taxTotal += t.inclusive ? 0 : amount; // inclusive tax is already inside netAmount
      lines.push({ description: `${t.name} (${t.percentBps / 100}%)${t.inclusive ? ' incl.' : ''}`, amount, quantity: 1 });
    }
    return { taxTotal, lines };
  }

  // ---- Company accounts (city ledger) ----
  createCompany(actor: Actor, input: { name: string; contact?: string; creditLimit?: number }) {
    return this.prisma.companyAccount.create({
      data: { hotelId: actor.hotelId, name: input.name, contact: input.contact, creditLimit: input.creditLimit ?? 0 },
    });
  }
  listCompanies(hotelId: string) {
    return this.prisma.companyAccount.findMany({ where: { hotelId }, orderBy: { name: 'asc' } });
  }

  // ---- Invoices ----
  private async nextNumber(hotelId: string): Promise<string> {
    const count = await this.prisma.invoice.count({ where: { hotelId } });
    return `INV-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Generate a tax invoice from a reservation folio. If `companyAccountId` is
   * given, the invoice is posted to that company's AR (city ledger).
   */
  async generateFromReservation(
    actor: Actor,
    reservationId: string,
    opts: { companyAccountId?: string; billToName?: string; billToCompany?: string } = {},
  ) {
    const folio = await this.prisma.folio.findFirst({
      where: { reservationId, reservation: { hotelId: actor.hotelId } },
      include: { lineItems: true, reservation: { include: { guest: true } } },
    });
    if (!folio) throw new NotFoundException('Folio not found');

    const charges: InvoiceLine[] = folio.lineItems.map((l) => ({
      description: l.description,
      amount: l.amount * l.quantity,
      quantity: 1,
    }));
    const subtotal = charges.reduce((s, l) => s + l.amount, 0);
    const { taxTotal, lines: taxLines } = await this.computeTaxes(actor.hotelId, subtotal);
    const total = subtotal + taxTotal;

    // Retry on the (hotelId, number) unique race so concurrent invoices don't collide.
    let invoice;
    for (let attempt = 0; ; attempt++) {
      const number = await this.nextNumber(actor.hotelId);
      try {
        invoice = await this.prisma.$transaction(async (tx) => {
          const inv = await tx.invoice.create({
            data: {
              hotelId: actor.hotelId,
              reservationId,
              companyAccountId: opts.companyAccountId,
              number,
              status: InvoiceStatus.ISSUED,
              subtotal,
              taxTotal,
              total,
              currency: folio.currency,
              billToName: opts.billToName ?? folio.reservation.guest.name,
              billToCompany: opts.billToCompany,
              lineItems: [...charges, ...taxLines] as unknown as Prisma.InputJsonValue,
            },
          });
          if (opts.companyAccountId) {
            await tx.companyAccount.update({
              where: { id: opts.companyAccountId },
              data: { balance: { increment: total } },
            });
          }
          return inv;
        });
        break;
      } catch (e) {
        const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (dup && attempt < 5) continue;
        throw e;
      }
    }
    await this.audit.record({ actor, action: 'invoice.generate', entity: 'Invoice', entityId: invoice.id, after: { number: invoice.number, total } });
    return invoice;
  }

  listInvoices(hotelId: string, status?: InvoiceStatus) {
    return this.prisma.invoice.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }

  async invoicePdf(hotelId: string, invoiceId: string): Promise<Buffer> {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, hotelId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { name: true } });
    const m = (n: number) => formatMoney(n, inv.currency);
    const lines = (inv.lineItems as unknown as InvoiceLine[]) ?? [];
    return buildPdf(`Invoice ${inv.number}`, `${hotel.name} · ${inv.issuedAt.toISOString().slice(0, 10)}`, [
      { heading: `Bill to: ${inv.billToName ?? ''}${inv.billToCompany ? ` (${inv.billToCompany})` : ''}`, lines: [] },
      { heading: 'Lines', lines: lines.map((l) => `${l.description}: ${m(l.amount)}`) },
      { heading: 'Totals', lines: [`Subtotal: ${m(inv.subtotal)}`, `Tax: ${m(inv.taxTotal)}`, `TOTAL: ${m(inv.total)}`] },
    ]);
  }
}
