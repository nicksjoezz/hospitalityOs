import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  DomainEvents,
  LoyaltyTxnType,
  PaymentRecordedPayload,
  ReservationCheckedOutPayload,
  toMajorUnits,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { AppConfig } from '../config/configuration';
import { Actor } from '../common/actor';

/** Lifetime-spend tier thresholds (minor units of the hotel base currency). */
const TIERS: { tier: string; min: number }[] = [
  { tier: 'PLATINUM', min: 500_000_000 },
  { tier: 'GOLD', min: 200_000_000 },
  { tier: 'SILVER', min: 50_000_000 },
  { tier: 'STANDARD', min: 0 },
];

/**
 * Guest CRM + loyalty (KitchenOS-inspired, fitted to the hotel guest model).
 * Tracks lifetime spend, visits, points and tier; awards points on payment and
 * counts a visit on checkout; supports segments for targeted marketing.
 */
@Injectable()
export class GuestsService {
  private readonly logger = new Logger(GuestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private tierFor(totalSpent: number): string {
    return TIERS.find((t) => totalSpent >= t.min)!.tier;
  }

  async get(hotelId: string, id: string) {
    const guest = await this.prisma.guest.findFirst({ where: { id, hotelId } });
    if (!guest) throw new NotFoundException('Guest not found');
    if (guest.idNumber) guest.idNumber = this.crypto.decrypt(guest.idNumber);
    return guest;
  }

  list(hotelId: string, opts?: { search?: string; vip?: boolean }) {
    return this.prisma.guest.findMany({
      where: {
        hotelId,
        anonymizedAt: null,
        ...(opts?.vip ? { vip: true } : {}),
        ...(opts?.search
          ? {
              OR: [
                { name: { contains: opts.search, mode: 'insensitive' } },
                { phone: { contains: opts.search } },
                { email: { contains: opts.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { totalSpent: 'desc' },
      take: 200,
    });
  }

  async updateProfile(
    actor: Actor,
    id: string,
    data: {
      vip?: boolean;
      birthday?: string;
      allergies?: string;
      preferences?: string;
      optedInMarketing?: boolean;
      notes?: string;
    },
  ) {
    await this.get(actor.hotelId, id);
    const updated = await this.prisma.guest.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'guest.update',
      entity: 'Guest',
      entityId: id,
      after: data,
    });
    return updated;
  }

  // ---- Segments (plan.md §11.13 targeting) ----
  async segments(hotelId: string) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);

    const [vip, recent, topSpenders, all] = await Promise.all([
      this.prisma.guest.count({ where: { hotelId, vip: true, anonymizedAt: null } }),
      this.prisma.guest.count({ where: { hotelId, createdAt: { gte: thirtyDaysAgo }, anonymizedAt: null } }),
      this.prisma.guest.findMany({
        where: { hotelId, anonymizedAt: null },
        orderBy: { totalSpent: 'desc' },
        take: 10,
        select: { id: true, name: true, totalSpent: true, loyaltyTier: true },
      }),
      this.prisma.guest.findMany({
        where: { hotelId, anonymizedAt: null },
        select: { id: true, lastVisitAt: true, visitCount: true, birthday: true },
      }),
    ]);
    const inactive = all.filter(
      (g) => g.visitCount > 0 && (!g.lastVisitAt || g.lastVisitAt < ninetyDaysAgo),
    ).length;
    const birthdays = all.filter((g) => g.birthday?.startsWith(`${month}-`)).length;

    return {
      vip,
      newThisMonth: recent,
      inactive,
      birthdaysThisMonth: birthdays,
      topSpenders,
    };
  }

  // ---- Loyalty ----
  async ledger(hotelId: string, guestId: string) {
    const guest = await this.get(hotelId, guestId);
    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { hotelId, guestId },
      orderBy: { at: 'desc' },
      take: 100,
    });
    return { balance: guest.loyaltyPoints, tier: guest.loyaltyTier, transactions };
  }

  async adjustPoints(actor: Actor, guestId: string, points: number, note?: string) {
    return this.applyPoints(actor.hotelId, guestId, points, LoyaltyTxnType.ADJUSTMENT, { note });
  }

  async redeemPoints(actor: Actor, guestId: string, points: number) {
    const guest = await this.get(actor.hotelId, guestId);
    const threshold = this.config.get('LOYALTY_REDEEM_THRESHOLD', { infer: true });
    if (guest.loyaltyPoints < threshold) {
      throw new NotFoundException(`Below redemption threshold (${threshold} points)`);
    }
    const redeem = Math.min(points, guest.loyaltyPoints);
    const value = redeem * this.config.get('LOYALTY_REDEEM_VALUE', { infer: true });
    await this.applyPoints(actor.hotelId, guestId, -redeem, LoyaltyTxnType.REDEEM, {
      note: `Redeemed for ${value} (minor units) credit`,
    });
    return { redeemed: redeem, valueMinorUnits: value };
  }

  private async applyPoints(
    hotelId: string,
    guestId: string,
    points: number,
    type: LoyaltyTxnType,
    opts: { note?: string; reservationId?: string } = {},
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.update({
        where: { id: guestId },
        data: { loyaltyPoints: { increment: points } },
      });
      await tx.loyaltyTransaction.create({
        data: {
          hotelId,
          guestId,
          points,
          type,
          reservationId: opts.reservationId,
          note: opts.note,
        },
      });
      return guest;
    });
    return { loyaltyPoints: result.loyaltyPoints };
  }

  // ---- Event-driven CRM updates (decoupled from payments/front-desk) ----
  @OnEvent(DomainEvents.PaymentRecorded)
  async onPaymentRecorded(payload: PaymentRecordedPayload): Promise<void> {
    try {
      if (!payload.reservationId || payload.amount <= 0) return;
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: payload.reservationId },
        select: { guestId: true, currency: true },
      });
      if (!reservation) return;

      const major = toMajorUnits(payload.amount, reservation.currency);
      const pointsPerUnit = this.config.get('LOYALTY_POINTS_PER_UNIT', { infer: true });
      const earned = Math.floor(major * pointsPerUnit);

      await this.prisma.$transaction(async (tx) => {
        const guest = await tx.guest.update({
          where: { id: reservation.guestId },
          data: {
            totalSpent: { increment: payload.amount },
            loyaltyPoints: { increment: earned },
            lastVisitAt: new Date(),
          },
        });
        const tier = this.tierFor(guest.totalSpent);
        await tx.guest.update({
          where: { id: guest.id },
          data: { loyaltyTier: tier, vip: guest.vip || tier === 'GOLD' || tier === 'PLATINUM' },
        });
        if (earned > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              hotelId: payload.hotelId,
              guestId: guest.id,
              points: earned,
              type: LoyaltyTxnType.EARN,
              reservationId: payload.reservationId,
              note: 'Earned on payment',
            },
          });
        }
      });
    } catch (e) {
      this.logger.error(`CRM payment hook failed: ${e}`);
    }
  }

  @OnEvent(DomainEvents.ReservationCheckedOut)
  async onCheckedOut(payload: ReservationCheckedOutPayload): Promise<void> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: payload.reservationId },
        select: { guestId: true },
      });
      if (!reservation) return;
      await this.prisma.guest.update({
        where: { id: reservation.guestId },
        data: { visitCount: { increment: 1 }, lastVisitAt: new Date() },
      });
    } catch (e) {
      this.logger.error(`CRM checkout hook failed: ${e}`);
    }
  }
}
