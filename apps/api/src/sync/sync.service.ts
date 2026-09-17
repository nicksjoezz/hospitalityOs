import { Injectable, Logger } from '@nestjs/common';
import {
  createReservationSchema,
  recordPaymentSchema,
  checkInSchema,
  MaintCategory,
  MaintSource,
  Priority,
  SyncOperationDto,
} from '@hospitalityos/shared';
import { z } from 'zod';
import { Actor } from '../common/actor';
import { ReservationsService } from '../reservations/reservations.service';
import { PaymentsService } from '../payments/payments.service';
import { FrontDeskService } from '../front-desk/front-desk.service';
import { MaintenanceService } from '../maintenance/maintenance.service';

export interface SyncResult {
  idempotencyKey: string;
  ok: boolean;
  status: number;
  result?: unknown;
  error?: string;
}

/**
 * Replays writes that a PWA client queued while offline (plan.md §10). Each op
 * carries a client-generated idempotencyKey; the underlying services dedupe on
 * it, so replaying the same queued write twice has exactly one effect.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly reservations: ReservationsService,
    private readonly payments: PaymentsService,
    private readonly frontDesk: FrontDeskService,
    private readonly maintenance: MaintenanceService,
  ) {}

  async replay(actor: Actor, ops: SyncOperationDto[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    // Deterministic order: as the client enqueued them.
    const ordered = [...ops].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    for (const op of ordered) {
      try {
        const result = await this.dispatch(actor, op);
        results.push({
          idempotencyKey: op.idempotencyKey,
          ok: true,
          status: 200,
          result,
        });
      } catch (e) {
        this.logger.warn(`sync op failed (${op.method} ${op.path}): ${e}`);
        results.push({
          idempotencyKey: op.idempotencyKey,
          ok: false,
          status: this.statusOf(e),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return results;
  }

  private async dispatch(actor: Actor, op: SyncOperationDto): Promise<unknown> {
    const body = (op.body ?? {}) as Record<string, unknown>;
    const withKey = { ...body, idempotencyKey: op.idempotencyKey };

    // POST /reservations
    if (op.method === 'POST' && /^\/reservations\/?$/.test(op.path)) {
      const dto = createReservationSchema.parse(withKey);
      return this.reservations.create(actor, dto);
    }

    const resMatch = /^\/reservations\/([^/]+)\/(payments|check-in|check-out)$/.exec(
      op.path,
    );
    if (op.method === 'POST' && resMatch) {
      const [, reservationId, action] = resMatch;
      if (action === 'payments') {
        const dto = recordPaymentSchema.parse(withKey);
        return this.payments.recordPayment(actor, reservationId, dto);
      }
      if (action === 'check-in') {
        const dto = checkInSchema.parse(body);
        return this.frontDesk.checkIn(actor, reservationId, dto);
      }
      if (action === 'check-out') {
        return this.frontDesk.checkOut(actor, reservationId);
      }
    }

    // POST /maintenance/tickets
    if (op.method === 'POST' && /^\/maintenance\/tickets\/?$/.test(op.path)) {
      const ticketSchema = z.object({
        roomId: z.string().uuid().optional(),
        areaId: z.string().uuid().optional(),
        category: z.nativeEnum(MaintCategory),
        priority: z.nativeEnum(Priority).optional(),
        title: z.string().min(1),
        description: z.string().min(1),
        photoUrls: z.array(z.string()).optional(),
        takesRoomOutOfService: z.boolean().optional(),
      });
      const dto = ticketSchema.parse(body);
      return this.maintenance.registerIssue(actor, {
        ...dto,
        source: MaintSource.STAFF,
        reporterRole: actor.role,
      });
    }

    throw new Error(`Unsupported sync operation: ${op.method} ${op.path}`);
  }

  private statusOf(e: unknown): number {
    const status = (e as { status?: number; getStatus?: () => number })?.status;
    if (typeof status === 'number') return status;
    const getStatus = (e as { getStatus?: () => number })?.getStatus;
    if (typeof getStatus === 'function') return getStatus.call(e);
    return 500;
  }
}
