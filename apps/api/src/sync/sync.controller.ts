import { Body, Controller, Post } from '@nestjs/common';
import { syncBatchSchema, SyncBatchDto } from '@hospitalityos/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentActor } from '../common/decorators';
import { Actor } from '../common/actor';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Replay a batch of writes queued while offline. Returns per-op outcomes. */
  @Post()
  replay(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(syncBatchSchema)) dto: SyncBatchDto,
  ) {
    return this.sync.replay(actor, dto.operations);
  }
}
