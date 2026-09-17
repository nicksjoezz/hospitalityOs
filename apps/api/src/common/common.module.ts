import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { EventBusService } from './event-bus.service';
import { IdempotencyService } from './idempotency.service';
import { CryptoService } from './crypto.service';

/**
 * Cross-cutting infrastructure shared by every domain module: the domain event
 * bus, audit logging, idempotency, and PII encryption. Global so modules need
 * not re-import.
 */
@Global()
@Module({
  providers: [EventBusService, AuditService, IdempotencyService, CryptoService],
  exports: [EventBusService, AuditService, IdempotencyService, CryptoService],
})
export class CommonModule {}
