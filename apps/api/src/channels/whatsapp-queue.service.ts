import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { AppConfig } from '../config/configuration';
import { WhatsAppCloudAdapter } from './whatsapp.adapter';

const QUEUE = 'whatsapp-outbound';

interface SendJob {
  to: string;
  kind: 'text' | 'template';
  body?: string;
  templateName?: string;
  lang?: string;
  params?: string[];
}

/**
 * Durable outbound WhatsApp delivery via BullMQ (plan.md §8): retries with
 * backoff and provider rate-limiting, decoupled from request handling. Producers
 * enqueue; a single worker drains to the WhatsApp adapter.
 */
@Injectable()
export class WhatsAppQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppQueueService.name);
  private connection!: IORedis;
  private queue!: Queue<SendJob>;
  private worker!: Worker<SendJob>;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly adapter: WhatsAppCloudAdapter,
  ) {}

  onModuleInit(): void {
    const url = this.config.get('REDIS_URL', { infer: true });
    // BullMQ requires maxRetriesPerRequest = null on the connection.
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    const connection = this.connection as unknown as ConnectionOptions;

    this.queue = new Queue<SendJob>(QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    this.worker = new Worker<SendJob>(
      QUEUE,
      async (job) => {
        const d = job.data;
        const res =
          d.kind === 'template'
            ? await this.adapter.sendTemplate(d.to, d.templateName!, d.lang ?? 'en', d.params)
            : await this.adapter.sendText(d.to, d.body ?? '');
        if (!res.ok) throw new Error(res.error ?? 'send failed'); // triggers retry
        return res;
      },
      {
        connection,
        concurrency: 5,
        // WhatsApp Cloud API rate cap (conservative): 60 msgs/sec.
        limiter: { max: 60, duration: 1000 },
      },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`WhatsApp job ${job?.id} failed: ${err.message}`),
    );
    this.logger.log('WhatsApp outbound queue ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueueText(to: string, body: string): Promise<void> {
    await this.queue.add('text', { to, kind: 'text', body });
  }

  async enqueueTemplate(
    to: string,
    templateName: string,
    lang = 'en',
    params: string[] = [],
  ): Promise<void> {
    await this.queue.add('template', { to, kind: 'template', templateName, lang, params });
  }
}
