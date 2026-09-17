import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import {
  recordPaymentSchema,
  RecordPaymentDto,
  Role,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { PaymentsService } from './payments.service';

@Controller('reservations/:reservationId')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('folio')
  getFolio(
    @CurrentUser() user: AuthUser,
    @Param('reservationId') reservationId: string,
  ) {
    return this.payments.getFolio(user.hotelId, reservationId);
  }

  @Roles(Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT)
  @Post('payments')
  record(
    @CurrentActor() actor: Actor,
    @Param('reservationId') reservationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(recordPaymentSchema)) dto: RecordPaymentDto,
  ) {
    return this.payments.recordPayment(actor, reservationId, {
      ...dto,
      idempotencyKey: dto.idempotencyKey ?? idempotencyKey,
    });
  }
}
