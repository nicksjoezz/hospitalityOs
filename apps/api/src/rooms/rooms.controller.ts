import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Role, RoomStatus } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { RoomsService } from './rooms.service';

const roomTypeSchema = z.object({
  name: z.string().min(1),
  basePrice: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  description: z.string().optional(),
});
const roomSchema = z.object({
  roomTypeId: z.string().uuid(),
  roomNumber: z.string().min(1),
  floor: z.string().optional(),
});
const statusSchema = z.object({
  status: z.nativeEnum(RoomStatus),
  note: z.string().optional(),
});

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  // ---- Room types ----
  @Roles(Role.OWNER, Role.MANAGER)
  @Post('types')
  createType(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(roomTypeSchema)) dto: z.infer<typeof roomTypeSchema>,
  ) {
    return this.rooms.createRoomType(actor, dto);
  }

  @Get('types')
  listTypes(@CurrentUser() user: AuthUser) {
    return this.rooms.listRoomTypes(user.hotelId);
  }

  // ---- Rooms ----
  @Roles(Role.OWNER, Role.MANAGER)
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(roomSchema)) dto: z.infer<typeof roomSchema>,
  ) {
    return this.rooms.createRoom(actor, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RoomStatus) {
    return this.rooms.listRooms(user.hotelId, status);
  }

  // Front desk / housekeeping / maintenance can flip room status (out-of-order etc.).
  @Roles(Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.MAINTENANCE, Role.HOUSEKEEPING)
  @Patch(':id/status')
  setStatus(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) dto: z.infer<typeof statusSchema>,
  ) {
    return this.rooms.setStatus(actor, id, dto.status, dto.note);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Delete(':id')
  remove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.rooms.remove(actor, id);
  }
}
