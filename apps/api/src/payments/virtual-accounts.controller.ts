import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { DynamicAccountsService } from './dynamic-accounts.service';

const createDvaSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  bankName: z.string().min(1).max(100).optional(),
  expiresInHours: z.number().int().min(1).max(168).optional(),
});

const reconcileSchema = z.object({
  accountNumber: z.string().min(6).max(20).optional(),
  reference: z.string().min(3).max(100).optional(),
  amountMinor: z.number().int().positive(),
  senderName: z.string().optional(),
  bankSessionId: z.string().optional(),
});

@Controller()
export class VirtualAccountsController {
  constructor(private readonly dvaService: DynamicAccountsService) {}

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
  @Post('reservations/:reservationId/virtual-account')
  createOrGetForReservation(
    @CurrentActor() actor: Actor,
    @Param('reservationId') reservationId: string,
    @Body(new ZodValidationPipe(createDvaSchema)) dto: z.infer<typeof createDvaSchema>,
  ) {
    return this.dvaService.getOrCreateForReservation(actor, reservationId, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
  @Get('reservations/:reservationId/virtual-account')
  listForReservation(
    @CurrentUser() user: AuthUser,
    @Param('reservationId') reservationId: string,
  ) {
    return this.dvaService.listForReservation(user.hotelId, reservationId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
  @Get('payments/virtual-accounts')
  listActive(@CurrentUser() user: AuthUser) {
    return this.dvaService.listActive(user.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
  @Post('payments/virtual-accounts/reconcile')
  reconcile(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(reconcileSchema)) dto: z.infer<typeof reconcileSchema>,
  ) {
    return this.dvaService.reconcileTransfer(actor, dto);
  }
}
