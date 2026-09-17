import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from './actor';

interface AuditInput {
  actor: Actor;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes one AuditLog row per mutation (plan.md §15). Pass the same `tx` used by
 * the mutation so the audit row commits atomically with the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: AuditInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        hotelId: input.actor.hotelId,
        actorId: input.actor.id ?? null,
        actorType: input.actor.type,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        before: (input.before ?? undefined) as Prisma.InputJsonValue,
        after: (input.after ?? undefined) as Prisma.InputJsonValue,
        ip: input.actor.ip ?? null,
      },
    });
  }
}
