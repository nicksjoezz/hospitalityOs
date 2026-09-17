import { Injectable, NotFoundException } from '@nestjs/common';
import { WaitlistStatus } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../common/actor';

/** Dining waitlist (KitchenOS-inspired). */
@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  add(
    actor: Actor,
    input: { guestName: string; phone?: string; partySize?: number; requestedTime?: Date; notes?: string },
  ) {
    return this.prisma.waitlist.create({
      data: {
        hotelId: actor.hotelId,
        guestName: input.guestName,
        phone: input.phone,
        partySize: input.partySize ?? 2,
        requestedTime: input.requestedTime,
        notes: input.notes,
        status: WaitlistStatus.WAITING,
      },
    });
  }

  list(hotelId: string, status?: WaitlistStatus) {
    return this.prisma.waitlist.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  private async transition(actor: Actor, id: string, status: WaitlistStatus, extra: object = {}) {
    const entry = await this.prisma.waitlist.findFirst({
      where: { id, hotelId: actor.hotelId },
    });
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    return this.prisma.waitlist.update({ where: { id }, data: { status, ...extra } });
  }

  async notify(actor: Actor, id: string) {
    const updated = await this.transition(actor, id, WaitlistStatus.NOTIFIED, { notifiedAt: new Date() });
    await this.prisma.notification.create({
      data: {
        hotelId: actor.hotelId,
        type: 'waitlist.notified',
        title: `Table ready for ${updated.guestName}`,
        body: `Party of ${updated.partySize}`,
        entityRef: id,
      },
    });
    return updated;
  }

  seat(actor: Actor, id: string) {
    return this.transition(actor, id, WaitlistStatus.SEATED);
  }

  cancel(actor: Actor, id: string) {
    return this.transition(actor, id, WaitlistStatus.CANCELLED);
  }
}
