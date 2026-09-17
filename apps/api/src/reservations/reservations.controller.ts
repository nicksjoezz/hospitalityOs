import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  availabilitySchema,
  AvailabilityDto,
  cancelReservationSchema,
  CancelReservationDto,
  createReservationSchema,
  CreateReservationDto,
  modifyReservationSchema,
  ModifyReservationDto,
  quoteSchema,
  QuoteDto,
  ReservationStatus,
  Role,
} from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post('availability')
  availability(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(availabilitySchema)) dto: AvailabilityDto,
  ) {
    return this.reservations.checkAvailability(user.hotelId, dto);
  }

  @Post('quote')
  quote(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(quoteSchema)) dto: QuoteDto,
  ) {
    return this.reservations.quote(user.hotelId, dto);
  }

  @Roles(Role.MANAGER, Role.FRONT_DESK)
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createReservationSchema))
    dto: CreateReservationDto,
  ) {
    return this.reservations.create(actor, {
      ...dto,
      idempotencyKey: dto.idempotencyKey ?? idempotencyKey,
    });
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: ReservationStatus,
  ) {
    return this.reservations.list(user.hotelId, status);
  }

  @Get('rack')
  rack(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date();
    const t = to ? new Date(to) : new Date(Date.now() + 14 * 86_400_000);
    return this.reservations.rack(user.hotelId, f, t);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reservations.get(user.hotelId, id);
  }

  @Roles(Role.MANAGER, Role.FRONT_DESK)
  @Patch(':id')
  modify(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(modifyReservationSchema))
    dto: ModifyReservationDto,
  ) {
    return this.reservations.modify(actor, id, dto);
  }

  @Roles(Role.MANAGER, Role.FRONT_DESK)
  @Post(':id/cancel')
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelReservationSchema))
    dto: CancelReservationDto,
  ) {
    return this.reservations.cancel(actor, id, dto.reason);
  }
}
