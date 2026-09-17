import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventName } from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * In-process domain event bus (plan.md §3.4, §5). Producers call `emit`;
 * subscribers use `@OnEvent(DomainEvents.X)`. Every event is also persisted to
 * the OutboxEvent table so async consumers (BullMQ workers in later phases) can
 * pick them up durably even across a restart/power cut.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  async emit<T extends object>(
    event: DomainEventName,
    payload: T & { hotelId?: string },
  ): Promise<void> {
    // Durable record first (outbox), then in-process dispatch.
    await this.prisma.outboxEvent.create({
      data: {
        type: event,
        hotelId: payload.hotelId ?? null,
        payload: payload as object,
      },
    });
    this.logger.debug(`emit ${event}`);
    this.emitter.emit(event, payload);
  }
}
