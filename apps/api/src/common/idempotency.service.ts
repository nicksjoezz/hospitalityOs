import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Idempotency for retryable writes — offline-sync replays and WhatsApp webhooks
 * (plan.md §3.8, §10). The first call with a given key runs the operation and
 * stores its result; subsequent calls with the same key return the stored
 * result without re-running, so replaying a queued write twice has one effect.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    params: {
      key?: string;
      hotelId?: string;
      method: string;
      path: string;
    },
    operation: () => Promise<T>,
  ): Promise<T> {
    const { key, hotelId, method, path } = params;
    if (!key) {
      return operation();
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (existing?.response !== undefined && existing?.response !== null) {
      this.logger.debug(`idempotency hit ${key}`);
      return existing.response as T;
    }

    const result = await operation();

    // Store result; ignore races where another replay inserted first.
    await this.prisma.idempotencyKey
      .upsert({
        where: { key },
        create: {
          key,
          hotelId: hotelId ?? null,
          method,
          path,
          requestHash: '',
          statusCode: 200,
          response: (result ?? null) as object,
        },
        update: {},
      })
      .catch((e) => this.logger.warn(`idempotency store race for ${key}: ${e}`));

    return result;
  }
}
