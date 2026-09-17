import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShiftStatus } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

/**
 * Cash-drawer shifts and end-of-shift reconciliation (plan.md §6.3, §11, §21).
 * Cash is first-class: each CASH payment accrues to the cashier's open shift, and
 * closing computes variance = countedCash − (openingFloat + cashCollected).
 */
@Injectable()
export class CashDrawerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async open(actor: Actor, openingFloat: number) {
    if (!actor.id) throw new BadRequestException('A user is required to open a shift');
    const existing = await this.prisma.cashDrawerShift.findFirst({
      where: { hotelId: actor.hotelId, userId: actor.id, status: ShiftStatus.OPEN },
    });
    if (existing) {
      throw new BadRequestException('You already have an open cash shift');
    }
    const shift = await this.prisma.cashDrawerShift.create({
      data: {
        hotelId: actor.hotelId,
        userId: actor.id,
        openingFloat,
        expectedCash: 0,
        status: ShiftStatus.OPEN,
      },
    });
    await this.audit.record({
      actor,
      action: 'cashdrawer.open',
      entity: 'CashDrawerShift',
      entityId: shift.id,
      after: shift,
    });
    return shift;
  }

  /** Apply a signed cash amount (negative for refunds) to a user's open shift. */
  async applyCash(
    hotelId: string,
    userId: string,
    signedAmount: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const shift = await client.cashDrawerShift.findFirst({
      where: { hotelId, userId, status: ShiftStatus.OPEN },
    });
    if (!shift) return; // no open shift — cash recorded but not attributed to a drawer
    await client.cashDrawerShift.update({
      where: { id: shift.id },
      data: { expectedCash: shift.expectedCash + signedAmount },
    });
  }

  async current(actor: Actor) {
    if (!actor.id) return null;
    return this.prisma.cashDrawerShift.findFirst({
      where: { hotelId: actor.hotelId, userId: actor.id, status: ShiftStatus.OPEN },
    });
  }

  async close(actor: Actor, countedCash: number) {
    const shift = await this.current(actor);
    if (!shift) throw new NotFoundException('No open cash shift to close');
    const expectedTotal = shift.openingFloat + shift.expectedCash;
    const variance = countedCash - expectedTotal;
    const updated = await this.prisma.cashDrawerShift.update({
      where: { id: shift.id },
      data: {
        countedCash,
        variance,
        closedAt: new Date(),
        status: ShiftStatus.CLOSED,
      },
    });
    await this.audit.record({
      actor,
      action: 'cashdrawer.close',
      entity: 'CashDrawerShift',
      entityId: shift.id,
      before: shift,
      after: updated,
    });
    return { ...updated, expectedTotal };
  }

  /** Manager sign-off after counting. */
  async reconcile(actor: Actor, shiftId: string) {
    const shift = await this.prisma.cashDrawerShift.findFirst({
      where: { id: shiftId, hotelId: actor.hotelId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== ShiftStatus.CLOSED) {
      throw new BadRequestException('Shift must be CLOSED before reconciliation');
    }
    const updated = await this.prisma.cashDrawerShift.update({
      where: { id: shiftId },
      data: { status: ShiftStatus.RECONCILED },
    });
    await this.audit.record({
      actor,
      action: 'cashdrawer.reconcile',
      entity: 'CashDrawerShift',
      entityId: shiftId,
      before: shift,
      after: updated,
    });
    return updated;
  }

  async list(hotelId: string, status?: ShiftStatus) {
    return this.prisma.cashDrawerShift.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }
}
