import { Body, Controller, Param, Post } from '@nestjs/common';
import { checkInSchema, CheckInDto, Role } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, Roles } from '../common/decorators';
import { Actor } from '../common/actor';
import { FrontDeskService } from './front-desk.service';

@Roles(Role.MANAGER, Role.FRONT_DESK)
@Controller('reservations/:reservationId')
export class FrontDeskController {
  constructor(private readonly frontDesk: FrontDeskService) {}

  @Post('check-in')
  checkIn(
    @CurrentActor() actor: Actor,
    @Param('reservationId') reservationId: string,
    @Body(new ZodValidationPipe(checkInSchema)) dto: CheckInDto,
  ) {
    return this.frontDesk.checkIn(actor, reservationId, dto);
  }

  @Post('check-out')
  checkOut(
    @CurrentActor() actor: Actor,
    @Param('reservationId') reservationId: string,
  ) {
    return this.frontDesk.checkOut(actor, reservationId);
  }
}
