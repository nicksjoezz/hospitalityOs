import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Feature, isoDate, PromoType, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { PromotionsService } from './promotions.service';

const promoSchema = z.object({
  code: z.string().min(2),
  type: z.nativeEnum(PromoType),
  value: z.number().int().positive(),
  validFrom: isoDate.optional(),
  validUntil: isoDate.optional(),
  maxUses: z.number().int().positive().optional(),
});
const giftSchema = z.object({ code: z.string().min(2), balance: z.number().int().positive() });

@RequireFeature(Feature.MARKETING)
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promos: PromotionsService) {}

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('codes')
  createPromo(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(promoSchema)) dto: z.infer<typeof promoSchema>,
  ) {
    return this.promos.createPromo(actor, dto);
  }

  @Get('codes')
  listPromos(@CurrentUser() user: AuthUser) {
    return this.promos.listPromos(user.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('reservations/:id/apply')
  apply(@CurrentActor() actor: Actor, @Param('id') id: string, @Body('code') code: string) {
    return this.promos.applyPromo(actor, id, code);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('gift-cards')
  createGift(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(giftSchema)) dto: z.infer<typeof giftSchema>,
  ) {
    return this.promos.createGiftCard(actor, dto);
  }

  @Get('gift-cards')
  listGift(@CurrentUser() user: AuthUser) {
    return this.promos.listGiftCards(user.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK)
  @Post('gift-cards/redeem')
  redeem(
    @CurrentActor() actor: Actor,
    @Body('reservationId') reservationId: string,
    @Body('code') code: string,
    @Body('amount') amount: number,
  ) {
    return this.promos.redeemGiftCard(actor, reservationId, code, amount);
  }
}
