import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, RoomStatus } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

/** Statuses a human may set directly (others are driven by the housekeeping/maintenance flows). */
const MANUAL_STATUSES: RoomStatus[] = [
  RoomStatus.AVAILABLE,
  RoomStatus.OUT_OF_SERVICE,
  RoomStatus.MAINTENANCE,
  RoomStatus.DIRTY,
];

/** Room types & rooms management + out-of-order control (plan.md §11.1–§11.3). */
@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Room types ----
  createRoomType(
    actor: Actor,
    input: { name: string; basePrice: number; capacity: number; description?: string },
  ) {
    return this.prisma.roomType.create({ data: { hotelId: actor.hotelId, ...input } });
  }

  listRoomTypes(hotelId: string) {
    return this.prisma.roomType.findMany({
      where: { hotelId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { rooms: true } } },
    });
  }

  // ---- Rooms ----
  createRoom(
    actor: Actor,
    input: { roomTypeId: string; roomNumber: string; floor?: string },
  ) {
    return this.prisma.room.create({
      data: {
        hotelId: actor.hotelId,
        roomTypeId: input.roomTypeId,
        roomNumber: input.roomNumber,
        floor: input.floor,
      },
    });
  }

  listRooms(hotelId: string, status?: RoomStatus) {
    return this.prisma.room.findMany({
      where: { hotelId, deletedAt: null, ...(status ? { status } : {}) },
      include: { roomType: { select: { name: true } } },
      orderBy: { roomNumber: 'asc' },
    });
  }

  /**
   * Manually set a room's status — e.g. take a room Out Of Service, send it to
   * Maintenance, or return it to service (AVAILABLE/DIRTY). Occupied rooms can't
   * be taken out of order while a guest is in-house.
   */
  async setStatus(actor: Actor, roomId: string, status: RoomStatus, note?: string) {
    if (!MANUAL_STATUSES.includes(status)) {
      throw new BadRequestException(`Status ${status} is set by the system, not manually`);
    }
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, hotelId: actor.hotelId, deletedAt: null },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.status === RoomStatus.OCCUPIED && status !== RoomStatus.AVAILABLE) {
      throw new BadRequestException('Cannot take an occupied room out of service; check out the guest first');
    }

    const updated = await this.prisma.room.update({
      where: { id: roomId },
      data: { status, notes: note ?? room.notes },
    });
    await this.audit.record({
      actor,
      action: 'room.set_status',
      entity: 'Room',
      entityId: roomId,
      before: { status: room.status },
      after: { status, note },
    });
    if (status === RoomStatus.OUT_OF_SERVICE || status === RoomStatus.MAINTENANCE) {
      await this.prisma.notification.create({
        data: {
          hotelId: actor.hotelId,
          role: Role.MANAGER,
          type: 'room.out_of_order',
          title: `Room ${room.roomNumber} → ${status}`,
          body: note ?? 'Status changed manually',
          entityRef: roomId,
        },
      });
    }
    return updated;
  }

  async remove(actor: Actor, roomId: string) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, hotelId: actor.hotelId, deletedAt: null },
    });
    if (!room) throw new NotFoundException('Room not found');
    return this.prisma.room.update({ where: { id: roomId }, data: { deletedAt: new Date() } });
  }
}
