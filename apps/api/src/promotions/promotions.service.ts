import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LineType, PromoType } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

/** Promo codes, vouchers and gift cards (plan.md §11.13). */
@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Promo codes ----
  createPromo(
    actor: Actor,
    input: { code: string; type: PromoType; value: number; validFrom?: Date; validUntil?: Date; maxUses?: number },
  ) {
    return this.prisma.promoCode.create({
      data: {
        hotelId: actor.hotelId,
        code: input.code.toUpperCase(),
        type: input.type,
        value: input.value,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        maxUses: input.maxUses,
      },
    });
  }

  listPromos(hotelId: string) {
    return this.prisma.promoCode.findMany({ where: { hotelId }, orderBy: { createdAt: 'desc' } });
  }

  private async validPromo(hotelId: string, code: string) {
    const promo = await this.prisma.promoCode.findFirst({
      where: { hotelId, code: code.toUpperCase(), active: true },
    });
    if (!promo) throw new NotFoundException('Promo code not found');
    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) throw new BadRequestException('Promo not yet valid');
    if (promo.validUntil && promo.validUntil < now) throw new BadRequestException('Promo expired');
    if (promo.maxUses && promo.usedCount >= promo.maxUses) throw new BadRequestException('Promo usage limit reached');
    return promo;
  }

  private discountFor(promo: { type: string; value: number }, amount: number): number {
    const d = promo.type === PromoType.PERCENT ? Math.round((amount * promo.value) / 100) : promo.value;
    return Math.min(d, amount);
  }

  /** Apply a promo to a reservation folio as a DISCOUNT line. */
  async applyPromo(actor: Actor, reservationId: string, code: string) {
    const promo = await this.validPromo(actor.hotelId, code);
    const folio = await this.prisma.folio.findFirst({
      where: { reservationId, reservation: { hotelId: actor.hotelId } },
    });
    if (!folio) throw new NotFoundException('Folio not found');
    const discount = this.discountFor(promo, folio.totalCharges);
    if (discount <= 0) throw new BadRequestException('No discount applicable');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.folioLineItem.create({
        data: {
          folioId: folio.id,
          type: LineType.DISCOUNT,
          description: `Promo ${promo.code}`,
          amount: -discount,
          quantity: 1,
          by: actor.id,
        },
      });
      const f = await tx.folio.update({
        where: { id: folio.id },
        data: { totalCharges: folio.totalCharges - discount, balance: folio.balance - discount },
      });
      await tx.promoCode.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } });
      return f;
    });
    await this.audit.record({
      actor, action: 'promo.apply', entity: 'Folio', entityId: folio.id,
      after: { code: promo.code, discount },
    });
    return { discount, balance: updated.balance };
  }

  // ---- Gift cards ----
  createGiftCard(actor: Actor, input: { code: string; balance: number }) {
    return this.prisma.giftCard.create({
      data: { hotelId: actor.hotelId, code: input.code.toUpperCase(), balance: input.balance },
    });
  }

  listGiftCards(hotelId: string) {
    return this.prisma.giftCard.findMany({ where: { hotelId }, orderBy: { createdAt: 'desc' } });
  }

  /** Redeem gift-card balance against a reservation folio (records a payment-like credit). */
  async redeemGiftCard(actor: Actor, reservationId: string, code: string, amount: number) {
    const card = await this.prisma.giftCard.findFirst({
      where: { hotelId: actor.hotelId, code: code.toUpperCase(), active: true },
    });
    if (!card) throw new NotFoundException('Gift card not found');
    if (amount <= 0 || amount > card.balance) throw new BadRequestException('Invalid redemption amount');
    const folio = await this.prisma.folio.findFirst({
      where: { reservationId, reservation: { hotelId: actor.hotelId } },
    });
    if (!folio) throw new NotFoundException('Folio not found');

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedCard = await tx.giftCard.update({
        where: { id: card.id },
        data: { balance: { decrement: amount } },
      });
      const f = await tx.folio.update({
        where: { id: folio.id },
        data: { totalPaid: folio.totalPaid + amount, balance: folio.balance - amount },
      });
      await tx.payment.create({
        data: {
          hotelId: actor.hotelId, folioId: folio.id, reservationId,
          amount, currency: folio.currency, baseAmount: amount,
          method: 'CARD', type: 'BALANCE', reference: `giftcard:${card.code}`,
          recordedById: actor.id ?? 'system', recordedByType: actor.type,
        },
      });
      return { cardBalance: updatedCard.balance, folioBalance: f.balance };
    });
    await this.audit.record({
      actor, action: 'giftcard.redeem', entity: 'GiftCard', entityId: card.id,
      after: { amount, reservationId },
    });
    return result;
  }
}
