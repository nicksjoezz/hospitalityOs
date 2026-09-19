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

  /**
   * Chain CRS - List Sister Properties in the Network
   */
  @Get('chain/properties')
  chainProperties(@CurrentUser() user: AuthUser) {
    return this.reservations.getChainProperties(user.hotelId);
  }

  /**
   * Chain CRS - Cross-Property Live Availability & Rates Search
   */
  @Post('chain/availability')
  chainAvailability(
    @CurrentUser() user: AuthUser,
    @Body() body: { checkIn: string; checkOut: string; adults?: number },
  ) {
    return this.reservations.checkChainAvailability({
      currentHotelId: user.hotelId,
      checkIn: new Date(body.checkIn),
      checkOut: new Date(body.checkOut),
      adults: body.adults,
    });
  }

  /**
   * Chain CRS - Book Directly into Sister Property
   */
  @Roles(Role.MANAGER, Role.FRONT_DESK)
  @Post('chain/book')
  bookSisterProperty(
    @CurrentActor() actor: Actor,
    @Body()
    body: {
      targetHotelId: string;
      roomTypeId: string;
      checkIn: string;
      checkOut: string;
      guest: { name: string; phone: string; email?: string };
      adults?: number;
      specialRequests?: string;
    },
  ) {
    return this.reservations.bookSisterProperty(actor, {
      targetHotelId: body.targetHotelId,
      roomTypeId: body.roomTypeId,
      checkIn: new Date(body.checkIn),
      checkOut: new Date(body.checkOut),
      guest: body.guest,
      adults: body.adults,
      specialRequests: body.specialRequests,
    });
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
    @Query('scope') scope?: string,
    @Query('search') search?: string,
  ) {
    return this.reservations.list(user.hotelId, { status, scope, search });
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
