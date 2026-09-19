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
import { ActorType, LineType, optionalEmail, ReservationSource, ReservationStatus, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { MenuService } from '../restaurant/menu.service';
import { PaymentsGatewayService } from '../payments/payments-gateway.service';
import { systemActor } from '../common/actor';
import { AppConfig } from '../config/configuration';
import { SmartLocksService } from '../smart-locks/smart-locks.service';

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
    private readonly smartLocks: SmartLocksService,
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

  /** Complete in-house guest stay & live folio lookup by room number & phone or reservationId. */
  @Get('stay')
  async stay(
    @Query('reservationId') reservationId?: string,
    @Query('roomNumber') roomNumber?: string,
    @Query('phone') phone?: string,
    @Query('hotelId') hotelId?: string,
  ) {
    let whereClause: any = {};
    if (reservationId) {
      whereClause = { id: reservationId };
      if (phone) {
        whereClause.guest = { phone: { contains: phone.trim() } };
      }
    } else if (roomNumber && phone) {
      const room = await this.prisma.room.findFirst({
        where: { roomNumber: roomNumber.trim(), ...(hotelId ? { hotelId } : {}) },
      });
      if (!room) throw new NotFoundException(`Room ${roomNumber} not found`);
      whereClause = {
        roomId: room.id,
        status: { in: [ReservationStatus.CHECKED_IN, ReservationStatus.CONFIRMED] },
        guest: { phone: { contains: phone.trim() } },
      };
    } else {
      throw new BadRequestException('Provide reservationId OR roomNumber and phone');
    }

    const reservation = await this.prisma.reservation.findFirst({
      where: whereClause,
      include: {
        guest: true,
        room: true,
        roomType: true,
        folio: {
          include: {
            lineItems: { orderBy: { at: 'desc' } },
            payments: { orderBy: { at: 'desc' } },
          },
        },
        hotel: { select: { id: true, name: true, currency: true, settings: true, phone: true } },
      },
    });
    if (!reservation) {
      throw new NotFoundException('Active stay not found. Please verify your room number and phone.');
    }

    return {
      reservationId: reservation.id,
      hotel: {
        id: reservation.hotel.id,
        name: reservation.hotel.name,
        currency: reservation.hotel.currency,
        phone: reservation.hotel.phone,
        wifiPassword: (reservation.hotel.settings as any)?.wifiPassword ?? 'WelcomeGuests',
      },
      guest: {
        name: reservation.guest.name,
        phone: reservation.guest.phone,
      },
      room: {
        number: reservation.room?.roomNumber ?? 'Unassigned',
        type: reservation.roomType?.name ?? 'Standard Room',
      },
      checkIn: reservation.checkInDate.toISOString().slice(0, 10),
      checkOut: reservation.checkOutDate.toISOString().slice(0, 10),
      status: reservation.status,
      folio: reservation.folio
        ? {
            id: reservation.folio.id,
            currency: reservation.folio.currency,
            totalCharges: reservation.folio.totalCharges,
            totalPaid: reservation.folio.totalPaid,
            balance: reservation.folio.balance,
            items: reservation.folio.lineItems.map((l) => ({
              id: l.id,
              description: l.description,
              amount: l.amount,
              type: l.type,
              at: l.at.toISOString(),
            })),
            payments: reservation.folio.payments.map((p) => ({
              id: p.id,
              amount: p.amount,
              method: p.method,
              at: p.at.toISOString(),
            })),
          }
        : null,
    };
  }

  /** In-room dining room service order: charges folio and alerts Kitchen/Bar. */
  @Post('portal/order')
  async portalOrder(
    @Body()
    body: {
      reservationId: string;
      phone: string;
      items: { menuItemId: string; quantity: number; notes?: string }[];
      specialInstructions?: string;
    },
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: body.reservationId },
      include: { guest: true, room: true, folio: true },
    });
    if (!reservation || reservation.guest.phone !== body.phone) {
      throw new NotFoundException('Reservation not found or phone mismatch');
    }
    if (!reservation.folio) {
      throw new BadRequestException('No active folio found for this stay');
    }
    if (!body.items || body.items.length === 0) {
      throw new BadRequestException('Order items required');
    }

    const itemIds = body.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: itemIds } },
    });
    const itemMap = new Map(menuItems.map((m) => [m.id, m]));

    let totalMinor = 0;
    const itemSummaries: string[] = [];

    for (const orderItem of body.items) {
      const mi = itemMap.get(orderItem.menuItemId);
      if (!mi) continue;
      const qty = Math.max(1, orderItem.quantity);
      totalMinor += mi.price * qty;
      itemSummaries.push(`${qty}x ${mi.name}${orderItem.notes ? ` (${orderItem.notes})` : ''}`);
    }

    if (totalMinor === 0) throw new BadRequestException('Invalid order items');

    const summaryText = itemSummaries.join(', ');
    const roomNum = reservation.room?.roomNumber ?? 'In-Room';

    await this.prisma.folioLineItem.create({
      data: {
        folioId: reservation.folio.id,
        type: LineType.FNB,
        description: `Room Service (${roomNum}): ${summaryText.slice(0, 80)}`,
        amount: totalMinor,
        quantity: 1,
        by: 'In-Room Guest Portal',
      },
    });

    await this.prisma.folio.update({
      where: { id: reservation.folio.id },
      data: {
        totalCharges: { increment: totalMinor },
        balance: { increment: totalMinor },
      },
    });

    await this.prisma.notification.createMany({
      data: [
        {
          hotelId: reservation.hotelId,
          role: Role.KITCHEN,
          type: 'order.room_service',
          title: `Room Service Order: ${roomNum}`,
          body: `${summaryText}${body.specialInstructions ? ` · Note: ${body.specialInstructions}` : ''}`,
          entityRef: reservation.id,
        },
        {
          hotelId: reservation.hotelId,
          role: Role.FRONT_DESK,
          type: 'order.room_service',
          title: `Room Service charged to ${roomNum}`,
          body: `${summaryText} — ${(totalMinor / 100).toLocaleString()}`,
          entityRef: reservation.id,
        },
      ],
    });

    return {
      ok: true,
      total: totalMinor,
      itemsSummary: summaryText,
      roomNumber: roomNum,
      message: `Your room service order has been sent to the kitchen for delivery to ${roomNum}!`,
    };
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

  /** Contactless MagicLink: get available upsells (early check-in, room upgrades, add-ons). */
  @Get('stay/upsells')
  async stayUpsells(
    @Query('reservationId') reservationId: string,
    @Query('phone') phone: string,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { guest: true, room: true, roomType: true },
    });
    if (!reservation || reservation.guest.phone !== phone) {
      throw new NotFoundException('Reservation not found or phone mismatch');
    }

    // Check if room is cleaned & ready for early check-in
    const roomReady = reservation.room ? reservation.room.status === 'AVAILABLE' : false;
    const earlyCheckinFee = Math.round(reservation.quotedPrice * 0.3); // 30% of base rate

    // Fetch potential upgrade room types
    const upgrades = await this.prisma.roomType.findMany({
      where: {
        hotelId: reservation.hotelId,
        id: { not: reservation.roomTypeId },
        basePrice: { gt: reservation.roomType.basePrice },
      },
      select: { id: true, name: true, basePrice: true, capacity: true, description: true },
    });

    const standardAddons = [
      { id: 'addon-airport', title: 'Airport VIP Transfer', price: 1500000, description: 'Chauffeured pickup with luggage assistance' },
      { id: 'addon-breakfast', title: 'Full Daily Breakfast Pass', price: 850000, description: 'Continental and hot buffet breakfast for your stay' },
      { id: 'addon-late-checkout', title: 'Late Check-Out (up to 4:00 PM)', price: 1000000, description: 'Relax longer without rushing on departure day' },
      { id: 'addon-welcome-fruit', title: 'Artisan Fruit & Wine Basket', price: 1200000, description: 'Fresh seasonal fruits and premium chilled beverage' },
    ];

    return {
      reservationId: reservation.id,
      earlyCheckin: {
        available: roomReady,
        fee: earlyCheckinFee,
        roomStatus: reservation.room?.status ?? 'UNASSIGNED',
        roomNumber: reservation.room?.roomNumber ?? null,
      },
      upgrades: upgrades.map((u) => ({
        roomTypeId: u.id,
        name: u.name,
        priceDelta: Math.max(0, u.basePrice - reservation.roomType.basePrice),
        capacity: u.capacity,
        description: u.description,
      })),
      addons: standardAddons,
    };
  }

  /** Contactless MagicLink: submit digital registration card & canvas signature. */
  @Post('stay/self-checkin')
  async selfCheckIn(
    @Body()
    body: {
      reservationId: string;
      phone: string;
      signatureDataUri?: string;
      idType?: string;
      idNumber?: string;
      agreedToRules: boolean;
      eta?: string;
    },
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: body.reservationId },
      include: { guest: true, room: true },
    });
    if (!reservation || reservation.guest.phone !== body.phone) {
      throw new NotFoundException('Reservation not found or phone mismatch');
    }
    if (!body.agreedToRules) {
      throw new BadRequestException('You must agree to the house rules to complete self check-in');
    }

    if (body.idType || body.idNumber) {
      await this.prisma.guest.update({
        where: { id: reservation.guestId },
        data: {
          idType: body.idType ?? reservation.guest.idType,
          idNumber: body.idNumber ?? reservation.guest.idNumber,
        },
      });
    }

    const note = `[Digital Pre-Checkin] Signature captured. ETA: ${body.eta || 'Standard'}.`;
    await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        specialRequests: reservation.specialRequests ? `${reservation.specialRequests} | ${note}` : note,
      },
    });

    await this.prisma.notification.create({
      data: {
        hotelId: reservation.hotelId,
        role: Role.FRONT_DESK,
        type: 'guest.self_checkin',
        title: `Self Check-In: ${reservation.guest.name}`,
        body: `Digital registration completed for ${reservation.room?.roomNumber ? `Room ${reservation.room.roomNumber}` : 'Stay'} · ETA: ${body.eta || 'Standard'}`,
        entityRef: reservation.id,
      },
    });

    return {
      ok: true,
      message: 'Digital self check-in completed! Your key will be ready upon arrival.',
    };
  }

  /** Contactless MagicLink: purchase an early check-in, upgrade, or add-on package. */
  @Post('stay/purchase-upsell')
  async purchaseUpsell(
    @Body()
    body: {
      reservationId: string;
      phone: string;
      title: string;
      amountMinor: number;
      type: 'EARLY_CHECKIN' | 'UPGRADE' | 'ADDON';
      upgradeRoomTypeId?: string;
    },
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: body.reservationId },
      include: { guest: true, room: true, folio: true },
    });
    if (!reservation || reservation.guest.phone !== body.phone) {
      throw new NotFoundException('Reservation not found or phone mismatch');
    }
    if (!reservation.folio) {
      throw new BadRequestException('No active folio for this reservation');
    }

    // Post to folio
    await this.prisma.folioLineItem.create({
      data: {
        folioId: reservation.folio.id,
        type: LineType.SERVICE,
        description: `MagicLink Upsell: ${body.title}`,
        amount: body.amountMinor,
        quantity: 1,
        by: 'MagicLink Guest Portal',
      },
    });

    await this.prisma.folio.update({
      where: { id: reservation.folio.id },
      data: {
        totalCharges: { increment: body.amountMinor },
        balance: { increment: body.amountMinor },
      },
    });

    // If upgrading room type, update reservation roomTypeId
    if (body.type === 'UPGRADE' && body.upgradeRoomTypeId) {
      await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: { roomTypeId: body.upgradeRoomTypeId },
      });
    }

    await this.prisma.notification.create({
      data: {
        hotelId: reservation.hotelId,
        role: Role.FRONT_DESK,
        type: 'upsell.purchased',
        title: `Upsell Purchased: ${body.title}`,
        body: `${reservation.guest.name} added ${body.title} — ${(body.amountMinor / 100).toLocaleString()}`,
        entityRef: reservation.id,
      },
    });

    return {
      ok: true,
      message: `Successfully added ${body.title} to your stay folio!`,
    };
  }

  @Get('stay/digital-key')
  async getDigitalKey(@Query('ref') reservationId: string) {
    if (!reservationId) throw new BadRequestException('Reservation reference required');
    const res = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { hotelId: true },
    });
    if (!res) throw new NotFoundException('Reservation not found');
    return this.smartLocks.generateRoomKey(res.hotelId, reservationId);
  }
}


