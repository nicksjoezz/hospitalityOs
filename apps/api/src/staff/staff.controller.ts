import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApprovalStatus, Role } from '@hospitalityos/shared';
import { isoDate } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor, CurrentUser, Roles, AuthUser } from '../common/decorators';
import { Actor } from '../common/actor';
import { StaffService } from './staff.service';

const profileSchema = z.object({
  userId: z.string().uuid(),
  department: z.nativeEnum(Role),
  hourlyRate: z.number().int().nonnegative().optional(),
  hireDate: isoDate.optional(),
  emergencyContact: z.string().optional(),
});
const shiftSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(Role),
  startsAt: isoDate,
  endsAt: isoDate,
  note: z.string().optional(),
});
const leaveSchema = z.object({
  type: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().optional(),
});

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('profiles')
  upsertProfile(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(profileSchema)) dto: z.infer<typeof profileSchema>,
  ) {
    return this.staff.upsertProfile(actor, dto.userId, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Post('shifts')
  createShift(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(shiftSchema)) dto: z.infer<typeof shiftSchema>,
  ) {
    return this.staff.createShift(actor, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Get('users')
  listUsers(@CurrentUser() user: AuthUser) {
    return this.staff.listUsers(user.hotelId);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  @Get('payroll')
  payroll(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    return this.staff.payroll(user.hotelId, f, t);
  }

  /** Staff member view of their own worked hours, hourly rate, and earned pay. */
  @Get('payroll/mine')
  payrollMine(
    @CurrentActor() actor: Actor,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const f = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
    const t = to ? new Date(to) : new Date();
    return this.staff.payrollMine(actor, f, t);
  }

  /** Finalize and approve payroll for a period, logging audit and notifying staff. */
  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  @Post('payroll/finalize')
  finalizePayroll(
    @CurrentActor() actor: Actor,
    @Body() body: { from: string; to: string; note?: string },
  ) {
    const f = new Date(body.from);
    const t = new Date(body.to);
    return this.staff.finalizePayroll(actor, f, t, body.note);
  }

  @Get('shifts')
  listShifts(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
  ) {
    return this.staff.listShifts(user.hotelId, { userId });
  }

  @Get('schedule/today')
  today(@CurrentUser() user: AuthUser) {
    return this.staff.todaySchedule(user.hotelId);
  }

  @Post('attendance/clock-in')
  clockIn(
    @CurrentActor() actor: Actor,
    @Body() dto?: { shiftId?: string; lat?: number; lng?: number; selfieUrl?: string },
  ) {
    return this.staff.clockIn(actor, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER, Role.ACCOUNTANT)
  @Get('attendance')
  listAttendance(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('flagged') flagged?: string,
  ) {
    return this.staff.listAttendance(user.hotelId, {
      userId,
      flagged: flagged === 'true' ? true : flagged === 'false' ? false : undefined,
    });
  }

  @Post('attendance/clock-out')
  clockOut(@CurrentActor() actor: Actor) {
    return this.staff.clockOut(actor);
  }

  @Post('leave')
  requestLeave(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(leaveSchema)) dto: z.infer<typeof leaveSchema>,
  ) {
    return this.staff.requestLeave(actor, dto);
  }

  @Roles(Role.OWNER, Role.MANAGER)
  @Patch('leave/:id')
  decideLeave(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body('status') status: ApprovalStatus,
  ) {
    return this.staff.decideLeave(actor, id, status);
  }

  @Get('leave')
  listLeave(@CurrentUser() user: AuthUser, @Query('status') status?: ApprovalStatus) {
    return this.staff.listLeave(user.hotelId, status);
  }
}
