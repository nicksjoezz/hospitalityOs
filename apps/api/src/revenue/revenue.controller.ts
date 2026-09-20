import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Feature, SuggestionStatus, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { RevenueService } from './revenue.service';

const ruleSchema = z.object({
  roomTypeId: z.string().uuid(),
  name: z.string().min(1),
  condition: z.record(z.unknown()).default({}),
  adjustmentType: z.enum(['PERCENT', 'FIXED']),
  adjustmentValue: z.number().int(),
  active: z.boolean().optional(),
});

@RequireFeature(Feature.ANALYTICS)
@Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
@Controller('revenue')
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  @Get('analytics')
  analytics(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    return this.revenue.analytics(user.hotelId, f, t);
  }

  @Get('past')
  past(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    return this.revenue.pastRevenue(user.hotelId, f, t);
  }

  @Get('past/export.csv')
  async pastCsv(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    const csv = await this.revenue.pastRevenueCsv(user.hotelId, f, t);
    res?.header('Content-Type', 'text/csv').header('Content-Disposition', 'attachment; filename="past-revenue.csv"').send(csv);
  }

  @Get('forecast')
  forecast(@CurrentUser() user: AuthUser, @Query('horizonDays') horizonDays?: string) {
    return this.revenue.forecast(user.hotelId, horizonDays ? Number(horizonDays) : 30);
  }

  @Post('auto-apply')
  autoApply(@CurrentActor() actor: Actor, @Body('horizonDays') horizonDays?: number) {
    return this.revenue.autoApply(actor, horizonDays ?? 14);
  }

  @Post('suggestions/generate')
  generate(@CurrentActor() actor: Actor, @Body('horizonDays') horizonDays?: number) {
    return this.revenue.generateSuggestions(actor, horizonDays ?? 14);
  }

  @Get('suggestions')
  list(@CurrentUser() user: AuthUser, @Query('status') status?: SuggestionStatus) {
    return this.revenue.listSuggestions(user.hotelId, status);
  }

  @Post('suggestions/:id/approve')
  approve(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.revenue.decide(actor, id, 'approve');
  }

  @Post('suggestions/:id/reject')
  reject(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.revenue.decide(actor, id, 'reject');
  }

  @Post('suggestions/:id/apply')
  apply(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.revenue.apply(actor, id);
  }

  // ---- Pricing rules ----
  @Post('rules')
  createRule(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(ruleSchema)) dto: z.infer<typeof ruleSchema>,
  ) {
    return this.revenue.createRule(actor, dto);
  }

  @Get('rules')
  listRules(@CurrentUser() user: AuthUser) {
    return this.revenue.listRules(user.hotelId);
  }

  @Post('rules/:id/active')
  setRuleActive(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('active') active: boolean,
  ) {
    return this.revenue.setRuleActive(actor, id, active);
  }
}
