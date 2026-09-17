import { Injectable } from '@nestjs/common';
import { Role } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { Actor } from '../common/actor';

/** Guest complaint capture (plan.md §11.11). Resolution tracking expands later. */
@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: Actor,
    input: {
      category: string;
      description: string;
      guestId?: string;
      reservationId?: string;
    },
  ) {
    const complaint = await this.prisma.complaint.create({
      data: {
        hotelId: actor.hotelId,
        category: input.category,
        description: input.description,
        guestId: input.guestId,
        reservationId: input.reservationId,
        status: 'OPEN',
      },
    });
    await this.audit.record({
      actor,
      action: 'complaint.create',
      entity: 'Complaint',
      entityId: complaint.id,
      after: complaint,
    });
    await this.prisma.notification.create({
      data: {
        hotelId: actor.hotelId,
        role: Role.MANAGER,
        type: 'complaint.new',
        title: `New complaint: ${input.category}`,
        body: input.description.slice(0, 140),
        entityRef: complaint.id,
      },
    });
    return complaint;
  }

  async list(hotelId: string, status?: string) {
    return this.prisma.complaint.findMany({
      where: { hotelId, ...(status ? { status } : {}) },
      orderBy: { at: 'desc' },
      take: 200,
    });
  }
}
