import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Feature, isoDate, RatePlanKind, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { RatesService } from './rates.service';
import { PricingService } from './pricing.service';

const planSchema = z.object({
  roomTypeId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  kind: z.nativeEnum(RatePlanKind).optional(),
  adjustmentType: z.enum(['PERCENT', 'FIXED', 'ABSOLUTE']).optional(),
  adjustmentValue: z.number().int().optional(),
  refundable: z.boolean().optional(),
});
const calSchema = z.object({
  roomTypeId: z.string().uuid(),
  from: isoDate,
  to: isoDate,
  price: z.number().int().nonnegative().optional(),
  minStay: z.number().int().positive().optional(),
  maxStay: z.number().int().positive().optional(),
  closedToArrival: z.boolean().optional(),
  stopSell: z.boolean().optional(),
});

@RequireFeature(Feature.RATE_MANAGEMENT)
@Controller('rates')
export class RatesController {
  constructor(
    private readonly rates: RatesService,
    private readonly pricing: PricingService,
  ) {}

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('plans')
  createPlan(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(planSchema)) dto: z.infer<typeof planSchema>,
  ) {
    return this.rates.createPlan(actor, dto);
  }

  @Get('plans')
  listPlans(@CurrentUser() user: AuthUser, @Query('roomTypeId') roomTypeId?: string) {
    return this.rates.listPlans(user.hotelId, roomTypeId);
  }

  @Get('calendar')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query('roomTypeId') roomTypeId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.rates.getCalendar(user.hotelId, roomTypeId, new Date(from), new Date(to));
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  @Post('calendar')
  setCalendar(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(calSchema)) dto: z.infer<typeof calSchema>,
  ) {
    return this.rates.setCalendar(actor, dto);
  }

  @Get('quote')
  quote(
    @CurrentUser() user: AuthUser,
    @Query('roomTypeId') roomTypeId: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('ratePlanId') ratePlanId?: string,
  ) {
    return this.pricing.quote(user.hotelId, roomTypeId, new Date(checkIn), new Date(checkOut), ratePlanId);
  }
}
