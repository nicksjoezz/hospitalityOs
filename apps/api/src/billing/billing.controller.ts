import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Feature, InvoiceStatus, Role, TaxKind } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, RequireFeature, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { BillingService } from './billing.service';

const taxSchema = z.object({
  name: z.string().min(1),
  kind: z.nativeEnum(TaxKind),
  percentBps: z.number().int().nonnegative(),
  inclusive: z.boolean().optional(),
});
const companySchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  creditLimit: z.number().int().nonnegative().optional(),
});
const invoiceSchema = z.object({
  reservationId: z.string().uuid(),
  companyAccountId: z.string().uuid().optional(),
  billToName: z.string().optional(),
  billToCompany: z.string().optional(),
});

@RequireFeature(Feature.BILLING_INVOICES)
@Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('taxes')
  createTax(@CurrentActor() actor: Actor, @Body(new ZodValidationPipe(taxSchema)) dto: z.infer<typeof taxSchema>) {
    return this.billing.createTax(actor, dto);
  }
  @Get('taxes')
  listTaxes(@CurrentUser() user: AuthUser) {
    return this.billing.listTaxes(user.hotelId);
  }

  @Post('companies')
  createCompany(@CurrentActor() actor: Actor, @Body(new ZodValidationPipe(companySchema)) dto: z.infer<typeof companySchema>) {
    return this.billing.createCompany(actor, dto);
  }
  @Get('companies')
  listCompanies(@CurrentUser() user: AuthUser) {
    return this.billing.listCompanies(user.hotelId);
  }

  @Post('invoices')
  generate(@CurrentActor() actor: Actor, @Body(new ZodValidationPipe(invoiceSchema)) dto: z.infer<typeof invoiceSchema>) {
    return this.billing.generateFromReservation(actor, dto.reservationId, dto);
  }
  @Get('invoices')
  listInvoices(@CurrentUser() user: AuthUser, @Query('status') status?: InvoiceStatus) {
    return this.billing.listInvoices(user.hotelId, status);
  }
  @Get('invoices/:id/pdf')
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.billing.invoicePdf(user.hotelId, id);
    res.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`).send(pdf);
  }
}
