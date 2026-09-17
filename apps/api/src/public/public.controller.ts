import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { ActorType, optionalEmail, ReservationSource, ReservationStatus } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { MenuService } from '../restaurant/menu.service';
import { PaymentsGatewayService } from '../payments/payments-gateway.service';
import { systemActor } from '../common/actor';
import { AppConfig } from '../config/configuration';

const bookSchema = z
  .object({
    hotelId: z.string().uuid().optional(),
    guestName: z.string().min(1),
    guestPhone: z.string().min(3),
    guestEmail: optionalEmail,
    roomTypeId: z.string().uuid(),
    checkIn: z.string().min(8),
    checkOut: z.string().min(8),
    adults: z.number().int().positive().optional(),
    // Optional online deposit at booking.
    provider: z.enum(['paystack', 'flutterwave']).optional(),
    depositAmount: z.number().int().positive().optional(),
  })
  .refine((v) => new Date(v.checkOut) > new Date(v.checkIn), {
    message: 'checkOut must be after checkIn',
  });

/**
 * Public, no-auth self-service surface (KitchenOS-inspired) so a hotel website /
 * booking widget can integrate: browse availability, request a booking, track a
 * reservation. Booking requests land as HELD for staff to confirm.
 */
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly menu: MenuService,
    private readonly gateway: PaymentsGatewayService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private async resolveHotel(hotelId?: string) {
    const hotel = hotelId
      ? await this.prisma.hotel.findUnique({ where: { id: hotelId } })
      : await this.prisma.hotel.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  @Get('hotel')
  async hotel(@Query('hotelId') hotelId?: string) {
    const h = await this.resolveHotel(hotelId);
    return { id: h.id, name: h.name, currency: h.currency, timezone: h.timezone };
  }

  @Get('room-types')
  async roomTypes(@Query('hotelId') hotelId?: string) {
    const h = await this.resolveHotel(hotelId);
    const types = await this.prisma.roomType.findMany({
      where: { hotelId: h.id },
      select: { id: true, name: true, basePrice: true, capacity: true, description: true },
    });
    return { hotelId: h.id, currency: h.currency, roomTypes: types };
  }

  @Get('availability')
  async availability(
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('hotelId') hotelId?: string,
  ) {
    if (!checkIn || !checkOut) throw new BadRequestException('checkIn and checkOut required');
    const h = await this.resolveHotel(hotelId);
    return this.reservations.checkAvailability(h.id, {
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
    });
  }

  @Get('menu')
  async publicMenu(@Query('hotelId') hotelId?: string) {
    const h = await this.resolveHotel(hotelId);
    const items = await this.menu.listItems(h.id);
    return {
      hotelId: h.id,
      currency: h.currency,
      items: items
        .filter((i) => i.available)
        .map((i) => ({ id: i.id, name: i.name, price: i.price })),
    };
  }

  @Post('book')
  async book(@Body(new ZodValidationPipe(bookSchema)) dto: z.infer<typeof bookSchema>) {
    if (!this.config.get('PUBLIC_BOOKING_ENABLED', { infer: true })) {
      throw new BadRequestException('Public booking is disabled');
    }
    const h = await this.resolveHotel(dto.hotelId);
    const reservation = await this.reservations.create(
      { type: ActorType.GUEST, hotelId: h.id },
      {
        guest: { name: dto.guestName, phone: dto.guestPhone, email: dto.guestEmail },
        roomTypeId: dto.roomTypeId,
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
        adults: dto.adults ?? 1,
        children: 0,
        source: ReservationSource.WEBSITE,
      },
      { status: ReservationStatus.HELD }, // pending staff confirmation / payment
    );

    // Optional online deposit — returns a hosted-checkout link; paying confirms the booking.
    let payment: { authorizationUrl: string; reference: string; provider: string } | undefined;
    if (dto.provider) {
      const deposit = dto.depositAmount ?? Math.round(reservation.quotedPrice / 2);
      payment = await this.gateway.initialize(
        systemActor(h.id),
        dto.provider,
        reservation.id,
        deposit,
      );
    }

    return {
      reservationId: reservation.id,
      status: reservation.status,
      message: payment
        ? 'Booking held — complete payment to confirm.'
        : 'Booking request received — we will confirm shortly.',
      ...(payment ? { payment } : {}),
    };
  }

  /** Guest self-service portal: view stay + folio after verifying the phone. */
  @Get('portal')
  async portal(@Query('reservationId') reservationId: string, @Query('phone') phone: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { guest: true, room: true, roomType: true, folio: true },
    });
    if (!reservation || !phone || reservation.guest.phone !== phone) {
      throw new NotFoundException('Reservation not found or phone mismatch');
    }
    return {
      reservationId: reservation.id,
      guest: reservation.guest.name,
      status: reservation.status,
      roomType: reservation.roomType.name,
      room: reservation.room?.roomNumber ?? null,
      checkIn: reservation.checkInDate.toISOString().slice(0, 10),
      checkOut: reservation.checkOutDate.toISOString().slice(0, 10),
      folio: reservation.folio
        ? {
            currency: reservation.folio.currency,
            totalCharges: reservation.folio.totalCharges,
            totalPaid: reservation.folio.totalPaid,
            balance: reservation.folio.balance,
          }
        : null,
    };
  }

  /** Guest portal service request (concierge / housekeeping). */
  @Post('portal/request')
  async portalRequest(
    @Body() body: { reservationId: string; phone: string; message: string },
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: body.reservationId },
      include: { guest: true },
    });
    if (!reservation || reservation.guest.phone !== body.phone) {
      throw new NotFoundException('Reservation not found or phone mismatch');
    }
    await this.prisma.complaint.create({
      data: {
        hotelId: reservation.hotelId,
        reservationId: reservation.id,
        guestId: reservation.guestId,
        category: 'guest_request',
        description: (body.message ?? '').slice(0, 1000),
        status: 'OPEN',
      },
    });
    await this.prisma.notification.create({
      data: {
        hotelId: reservation.hotelId,
        role: 'FRONT_DESK',
        type: 'guest.request',
        title: `Guest request — ${reservation.guest.name}`,
        body: (body.message ?? '').slice(0, 140),
        entityRef: reservation.id,
      },
    });
    return { ok: true, message: 'Request received — our team will assist you.' };
  }

  @Get('track/:id')
  async track(@Param('id') id: string) {
    const r = await this.prisma.reservation.findUnique({
      where: { id },
      select: { id: true, status: true, checkInDate: true, checkOutDate: true },
    });
    if (!r) throw new NotFoundException('Reservation not found');
    return {
      reservationId: r.id,
      status: r.status,
      checkIn: r.checkInDate.toISOString().slice(0, 10),
      checkOut: r.checkOutDate.toISOString().slice(0, 10),
    };
  }
}
