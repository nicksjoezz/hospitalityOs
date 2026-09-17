import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  approveHotelSchema,
  ApproveHotelDto,
  extendTrialSchema,
  ExtendTrialDto,
  HotelStatus,
  markInvoicePaidSchema,
  MarkInvoicePaidDto,
  planSchema,
  PlanDto,
  setFeatureOverridesSchema,
  SetFeatureOverridesDto,
  setHotelPlanSchema,
  SetHotelPlanDto,
  SubInvoiceStatus,
  suspendHotelSchema,
  SuspendHotelDto,
  updatePlanSchema,
  UpdatePlanDto,
  updatePlatformSettingsSchema,
  UpdatePlatformSettingsDto,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  CurrentPlatformAdmin,
  Platform,
  PlatformPrincipal,
} from '../common/decorators';
import { PlatformService } from './platform.service';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformAuthService } from './platform-auth.service';

/** Master controller — every route requires a platform-admin token. */
@Platform()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly settings: PlatformSettingsService,
    private readonly billing: PlatformBillingService,
    private readonly admins: PlatformAuthService,
  ) {}

  @Get('stats')
  async stats() {
    return { ...(await this.platform.stats()), billing: await this.billing.mrr() };
  }

  // ---- Platform settings ----
  @Get('settings')
  getSettings() {
    return this.settings.getSafe();
  }

  @Patch('settings')
  updateSettings(
    @Body(new ZodValidationPipe(updatePlatformSettingsSchema)) dto: UpdatePlatformSettingsDto,
  ) {
    return this.settings.update(dto);
  }

  // ---- Subscription billing ----
  @Get('invoices')
  listInvoices(
    @Query('hotelId') hotelId?: string,
    @Query('status') status?: SubInvoiceStatus,
  ) {
    return this.billing.listInvoices({ hotelId, status });
  }

  @Post('invoices/:id/mark-paid')
  markPaid(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markInvoicePaidSchema)) dto: MarkInvoicePaidDto,
  ) {
    return this.billing.markPaid(admin.id, id, dto);
  }

  @Post('hotels/:id/issue-invoice')
  issueInvoice(@Param('id') id: string) {
    return this.billing.issueInvoice(id);
  }

  // ---- Platform team management ----
  @Patch('admins/:id/active')
  setAdminActive(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.admins.setActive(admin, id, !!body?.active);
  }

  // ---- Hotels ----
  @Get('hotels')
  listHotels(@Query('status') status?: HotelStatus, @Query('q') q?: string) {
    return this.platform.listHotels({ status, q });
  }

  @Get('hotels/:id')
  getHotel(@Param('id') id: string) {
    return this.platform.getHotel(id);
  }

  @Post('hotels/:id/approve')
  approve(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveHotelSchema)) dto: ApproveHotelDto,
  ) {
    return this.platform.approve(admin.id, id, dto);
  }

  @Post('hotels/:id/suspend')
  suspend(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suspendHotelSchema)) dto: SuspendHotelDto,
  ) {
    return this.platform.suspend(admin.id, id, dto);
  }

  @Post('hotels/:id/reactivate')
  reactivate(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
  ) {
    return this.platform.reactivate(admin.id, id);
  }

  @Post('hotels/:id/cancel')
  cancel(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
  ) {
    return this.platform.cancel(admin.id, id);
  }

  @Patch('hotels/:id/plan')
  setPlan(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setHotelPlanSchema)) dto: SetHotelPlanDto,
  ) {
    return this.platform.setPlan(admin.id, id, dto);
  }

  @Patch('hotels/:id/features')
  setFeatures(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setFeatureOverridesSchema)) dto: SetFeatureOverridesDto,
  ) {
    return this.platform.setFeatures(admin.id, id, dto);
  }

  @Post('hotels/:id/extend-trial')
  extendTrial(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extendTrialSchema)) dto: ExtendTrialDto,
  ) {
    return this.platform.extendTrial(admin.id, id, dto);
  }

  @Post('hotels/:id/impersonate')
  impersonate(
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Param('id') id: string,
  ) {
    return this.platform.impersonate(admin.role, admin.id, id);
  }

  // ---- Plans ----
  @Get('plans')
  listPlans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  createPlan(@Body(new ZodValidationPipe(planSchema)) dto: PlanDto) {
    return this.platform.createPlan(dto);
  }

  @Patch('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) dto: UpdatePlanDto,
  ) {
    return this.platform.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  deactivatePlan(@Param('id') id: string) {
    return this.platform.deactivatePlan(id);
  }
}
