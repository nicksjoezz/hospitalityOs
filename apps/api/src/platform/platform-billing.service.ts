import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ActorType,
  HotelStatus,
  MarkInvoicePaidDto,
  PlanInterval,
  SubInvoiceStatus,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { AuditService } from '../common/audit.service';
import { PlatformSettingsService } from './platform-settings.service';

const DAY = 86_400_000;
const MONTHS: Record<string, number> = {
  [PlanInterval.MONTHLY]: 1,
  [PlanInterval.QUARTERLY]: 3,
  [PlanInterval.YEARLY]: 12,
};

/**
 * Subscription billing: the platform raises an invoice per hotel per plan period,
 * collects it manually (master marks paid) or online (hotel pays via the master's
 * gateway), and auto-suspends hotels whose invoices fall overdue past the grace
 * period. MRR is computed from currently-active paid subscriptions.
 */
@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- issuing
  private addMonths(d: Date, n: number): Date {
    const r = new Date(d);
    r.setMonth(r.getMonth() + n);
    return r;
  }

  private async nextNumber(): Promise<string> {
    const count = await this.prisma.subscriptionInvoice.count();
    return `SUB-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Start (or roll) a hotel's subscription: issue an OPEN invoice for the period
   * beginning `from`, set its paid-through, and return the invoice. No-op for
   * free plans. Called on approval and by the renewal cron.
   */
  async issueInvoice(hotelId: string, from: Date = new Date()) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { plan: true },
    });
    if (!hotel?.plan) return null;
    if (hotel.plan.priceMinor <= 0) {
      // Free plan: just keep access open, no invoice.
      await this.prisma.hotel.update({
        where: { id: hotelId },
        data: { currentPeriodEnd: null },
      });
      return null;
    }
    const grace = (await this.settings.get()).gracePeriodDays;
    const periodEnd = this.addMonths(from, MONTHS[hotel.plan.interval] ?? 1);

    let invoice;
    for (let attempt = 0; ; attempt++) {
      const number = await this.nextNumber();
      try {
        invoice = await this.prisma.subscriptionInvoice.create({
          data: {
            hotelId,
            planId: hotel.planId,
            number,
            periodStart: from,
            periodEnd,
            amountMinor: hotel.plan.priceMinor,
            currency: hotel.plan.currency,
            status: SubInvoiceStatus.OPEN,
            dueAt: new Date(from.getTime() + grace * DAY),
          },
        });
        break;
      } catch (e) {
        const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (dup && attempt < 5) continue;
        throw e;
      }
    }
    await this.prisma.hotel.update({
      where: { id: hotelId },
      data: { currentPeriodEnd: periodEnd },
    });
    return invoice;
  }

  // ---------------------------------------------------------------- paying
  async markPaid(
    actorId: string | undefined,
    invoiceId: string,
    dto: MarkInvoicePaidDto,
    method = 'MANUAL',
  ) {
    const inv = await this.prisma.subscriptionInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === SubInvoiceStatus.PAID) return inv;

    const updated = await this.prisma.subscriptionInvoice.update({
      where: { id: invoiceId },
      data: {
        status: SubInvoiceStatus.PAID,
        paidAt: new Date(),
        method,
        reference: dto.reference ?? inv.reference,
        note: dto.note,
      },
    });
    // Extend paid-through and lift any non-payment suspension.
    const hotel = await this.prisma.hotel.findUnique({ where: { id: inv.hotelId } });
    if (hotel) {
      const reinstate =
        hotel.status === HotelStatus.SUSPENDED &&
        (hotel.suspendReason ?? '').toLowerCase().includes('subscription');
      await this.prisma.hotel.update({
        where: { id: inv.hotelId },
        data: {
          currentPeriodEnd:
            hotel.currentPeriodEnd && hotel.currentPeriodEnd > inv.periodEnd
              ? hotel.currentPeriodEnd
              : inv.periodEnd,
          ...(reinstate
            ? { status: HotelStatus.ACTIVE, suspendedAt: null, suspendReason: null }
            : {}),
        },
      });
    }
    await this.audit.record({
      actor: { type: ActorType.SYSTEM, id: actorId, hotelId: inv.hotelId },
      action: 'platform.subscription.paid',
      entity: 'SubscriptionInvoice',
      entityId: invoiceId,
      after: { number: inv.number, method },
    });
    return updated;
  }

  // ---------------------------------------------------------------- listing / stats
  listInvoices(filter: { hotelId?: string; status?: SubInvoiceStatus }) {
    return this.prisma.subscriptionInvoice.findMany({
      where: {
        ...(filter.hotelId ? { hotelId: filter.hotelId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });
  }

  /** Monthly Recurring Revenue: active paid subscriptions normalised to /month. */
  async mrr() {
    const hotels = await this.prisma.hotel.findMany({
      where: { status: HotelStatus.ACTIVE, plan: { priceMinor: { gt: 0 } } },
      include: { plan: true },
    });
    let mrrMinor = 0;
    const byCurrency: Record<string, number> = {};
    for (const h of hotels) {
      if (!h.plan) continue;
      const perMonth = Math.round(h.plan.priceMinor / (MONTHS[h.plan.interval] ?? 1));
      mrrMinor += perMonth;
      byCurrency[h.plan.currency] = (byCurrency[h.plan.currency] ?? 0) + perMonth;
    }
    const [outstanding, overdue] = await Promise.all([
      this.prisma.subscriptionInvoice.aggregate({
        where: { status: SubInvoiceStatus.OPEN },
        _sum: { amountMinor: true },
      }),
      this.prisma.subscriptionInvoice.count({ where: { status: SubInvoiceStatus.OVERDUE } }),
    ]);
    return {
      mrrMinor,
      byCurrency,
      payingHotels: hotels.length,
      outstandingMinor: outstanding._sum.amountMinor ?? 0,
      overdueCount: overdue,
    };
  }

  // ---------------------------------------------------------------- cron
  /** Daily: mark overdue + suspend, then roll the next period for active subs. */
  @Cron('0 30 2 * * *')
  async sweep() {
    const now = new Date();
    const grace = (await this.settings.get()).gracePeriodDays;

    // 1) OPEN past due → OVERDUE
    await this.prisma.subscriptionInvoice.updateMany({
      where: { status: SubInvoiceStatus.OPEN, dueAt: { lt: now } },
      data: { status: SubInvoiceStatus.OVERDUE },
    });

    // 2) Suspend hotels with an OVERDUE invoice past due + grace (still ACTIVE).
    const cutoff = new Date(now.getTime() - grace * DAY);
    const overdue = await this.prisma.subscriptionInvoice.findMany({
      where: { status: SubInvoiceStatus.OVERDUE, dueAt: { lt: cutoff }, hotel: { status: HotelStatus.ACTIVE } },
      select: { hotelId: true, number: true },
      distinct: ['hotelId'],
    });
    for (const o of overdue) {
      await this.prisma.hotel.update({
        where: { id: o.hotelId },
        data: { status: HotelStatus.SUSPENDED, suspendedAt: now, suspendReason: 'Overdue subscription payment' },
      });
      await this.audit.record({
        actor: { type: ActorType.SYSTEM, hotelId: o.hotelId },
        action: 'platform.subscription.auto_suspend',
        entity: 'Hotel',
        entityId: o.hotelId,
        after: { invoice: o.number },
      });
    }

    // 3) Roll next period for active paid subs whose period has ended and which
    //    have no outstanding invoice.
    const due = await this.prisma.hotel.findMany({
      where: {
        status: HotelStatus.ACTIVE,
        plan: { priceMinor: { gt: 0 } },
        currentPeriodEnd: { lte: now },
      },
      select: { id: true, currentPeriodEnd: true },
    });
    for (const h of due) {
      const open = await this.prisma.subscriptionInvoice.count({
        where: { hotelId: h.id, status: { in: [SubInvoiceStatus.OPEN, SubInvoiceStatus.OVERDUE] } },
      });
      if (open === 0) await this.issueInvoice(h.id, h.currentPeriodEnd ?? now);
    }
  }

  // ---------------------------------------------------------------- online pay
  async initOnlinePayment(hotelId: string, invoiceId: string) {
    const cfg = await this.settings.paymentConfig();
    if (!cfg) throw new BadRequestException('Online subscription payment is not configured');
    const inv = await this.prisma.subscriptionInvoice.findFirst({ where: { id: invoiceId, hotelId } });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === SubInvoiceStatus.PAID) throw new BadRequestException('Already paid');

    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { contactEmail: true },
    });
    const owner = hotel?.contactEmail
      ? null
      : await this.prisma.user.findFirst({
          where: { hotelId, role: 'OWNER', email: { not: null } },
          select: { email: true },
        });
    const email = hotel?.contactEmail ?? owner?.email ?? `billing+${hotelId}@hospitalityos.local`;

    const reference = `sub_${inv.id}_${crypto.randomBytes(5).toString('hex')}`;
    await this.prisma.subscriptionInvoice.update({ where: { id: inv.id }, data: { reference } });
    const callbackUrl = `${this.config.get('APP_BASE_URL', { infer: true })}/`;

    if (cfg.provider === 'PAYSTACK') {
      return this.paystackInit(cfg.secretKey, { email, amountMinor: inv.amountMinor, currency: inv.currency, reference, callbackUrl });
    }
    if (cfg.provider === 'FLUTTERWAVE') {
      return this.flutterwaveInit(cfg.secretKey, { email, amountMinor: inv.amountMinor, currency: inv.currency, reference, callbackUrl });
    }
    throw new BadRequestException(`Unsupported provider ${cfg.provider}`);
  }

  /** Verify a gateway webhook with the master's keys and mark the invoice paid. */
  async handleWebhook(provider: string, rawBody: Buffer | undefined, headers: Record<string, unknown>) {
    const cfg = await this.settings.paymentConfig();
    if (!cfg || cfg.provider !== provider.toUpperCase() || !rawBody) return { ok: false };

    let reference: string | undefined;
    let success = false;
    if (provider.toUpperCase() === 'PAYSTACK') {
      const sig = headers['x-paystack-signature'] as string | undefined;
      const expected = crypto.createHmac('sha512', cfg.secretKey).update(rawBody).digest('hex');
      if (!sig || sig !== expected) return { ok: false };
      try {
        const p = JSON.parse(rawBody.toString()) as { event?: string; data?: { reference?: string } };
        success = p.event === 'charge.success';
        reference = p.data?.reference;
      } catch {
        return { ok: false };
      }
    } else if (provider.toUpperCase() === 'FLUTTERWAVE') {
      const sig = headers['verif-hash'] as string | undefined;
      // Flutterwave compares against the configured secret hash (we reuse secretKey’s hash slot).
      if (!sig || sig !== cfg.secretKey) return { ok: false };
      try {
        const p = JSON.parse(rawBody.toString()) as { data?: { status?: string; tx_ref?: string } };
        success = p.data?.status === 'successful';
        reference = p.data?.tx_ref;
      } catch {
        return { ok: false };
      }
    }

    if (success && reference) {
      const inv = await this.prisma.subscriptionInvoice.findFirst({ where: { reference } });
      if (inv && inv.status !== SubInvoiceStatus.PAID) {
        await this.markPaid(undefined, inv.id, { reference }, provider.toUpperCase());
      }
    }
    return { ok: true };
  }

  private async paystackInit(
    secret: string,
    o: { email: string; amountMinor: number; currency: string; reference: string; callbackUrl: string },
  ) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: o.email, amount: o.amountMinor, currency: o.currency, reference: o.reference, callback_url: o.callbackUrl }),
        signal: controller.signal,
      });
      const json = (await res.json()) as { data?: { authorization_url: string } };
      if (!res.ok || !json.data) throw new Error(`Paystack init failed (${res.status})`);
      return { authorizationUrl: json.data.authorization_url, reference: o.reference };
    } catch (e) {
      this.logger.error(`Paystack subscription init error: ${e}`);
      throw new BadRequestException('Could not start payment');
    } finally {
      clearTimeout(t);
    }
  }

  private async flutterwaveInit(
    secret: string,
    o: { email: string; amountMinor: number; currency: string; reference: string; callbackUrl: string },
  ) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_ref: o.reference,
          amount: o.amountMinor / 100,
          currency: o.currency,
          redirect_url: o.callbackUrl,
          customer: { email: o.email },
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as { data?: { link: string } };
      if (!res.ok || !json.data) throw new Error(`Flutterwave init failed (${res.status})`);
      return { authorizationUrl: json.data.link, reference: o.reference };
    } catch (e) {
      this.logger.error(`Flutterwave subscription init error: ${e}`);
      throw new BadRequestException('Could not start payment');
    } finally {
      clearTimeout(t);
    }
  }
}
