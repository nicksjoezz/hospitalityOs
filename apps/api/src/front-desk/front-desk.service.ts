import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckInDto,
  DomainEvents,
  PaymentType,
  ReservationStatus,
  RoomStatus,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../common/event-bus.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class FrontDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

  async checkIn(actor: Actor, reservationId: string, dto: CheckInDto) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, hotelId: actor.hotelId },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (
      reservation.status !== ReservationStatus.CONFIRMED &&
      reservation.status !== ReservationStatus.HELD
    ) {
      throw new BadRequestException(
        `Cannot check in a ${reservation.status} reservation`,
      );
    }

    const roomId = dto.roomId ?? reservation.roomId;
    if (!roomId) {
      throw new BadRequestException('No room assigned; provide roomId');
    }
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, hotelId: actor.hotelId },
    });
    if (!room) throw new NotFoundException('Room not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.CHECKED_IN, roomId },
      });
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.OCCUPIED },
      });
      await tx.reservationStatusHistory.create({
        data: {
          reservationId,
          fromStatus: reservation.status,
          toStatus: ReservationStatus.CHECKED_IN,
          byId: actor.id,
          note: 'check-in',
        },
      });
      await this.audit.record(
        {
          actor,
          action: 'reservation.check_in',
          entity: 'Reservation',
          entityId: reservationId,
          before: reservation,
        },
        tx,
      );
    });

    // Optional deposit at check-in (cash-first).
    if (dto.depositAmount && dto.depositMethod) {
      await this.payments.recordPayment(actor, reservationId, {
        amount: dto.depositAmount,
        method: dto.depositMethod,
        type: PaymentType.DEPOSIT,
      });
    }

    await this.events.emit(DomainEvents.ReservationCheckedIn, {
      hotelId: actor.hotelId,
      reservationId,
      roomId,
      actorId: actor.id,
    });

    return { ok: true, roomId, status: ReservationStatus.CHECKED_IN };
  }

  async checkOut(actor: Actor, reservationId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, hotelId: actor.hotelId },
      include: { folio: true },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status !== ReservationStatus.CHECKED_IN) {
      throw new BadRequestException(
        `Cannot check out a ${reservation.status} reservation`,
      );
    }
    const roomId = reservation.roomId;
    if (!roomId) throw new BadRequestException('Reservation has no room');

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.CHECKED_OUT },
      });
      // Room becomes DIRTY → housekeeping picks it up via the event below.
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DIRTY },
      });
      await tx.reservationStatusHistory.create({
        data: {
          reservationId,
          fromStatus: ReservationStatus.CHECKED_IN,
          toStatus: ReservationStatus.CHECKED_OUT,
          byId: actor.id,
          note: 'check-out',
        },
      });
      await this.audit.record(
        {
          actor,
          action: 'reservation.check_out',
          entity: 'Reservation',
          entityId: reservationId,
          before: reservation,
        },
        tx,
      );
    });

    const folioBalance = reservation.folio?.balance ?? 0;

    // Drives Housekeeping to auto-create a CHECKOUT_CLEAN task (plan.md §5, §11.2).
    await this.events.emit(DomainEvents.ReservationCheckedOut, {
      hotelId: actor.hotelId,
      reservationId,
      roomId,
      folioBalance,
      actorId: actor.id,
    });

    return { ok: true, folioBalance, status: ReservationStatus.CHECKED_OUT };
  }
}
