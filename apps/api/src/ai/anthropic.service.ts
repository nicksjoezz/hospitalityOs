import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfig } from '../config/configuration';

export type ModelTier = 'cheap' | 'balanced' | 'smart';

/**
 * Thin wrapper over the Anthropic SDK (plan.md §7.3). Handles model routing and
 * prompt caching of the (repeated) hotel-context system prompt. If no API key is
 * configured, `isConfigured()` is false and callers fall back gracefully.
 */
@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY not set — AI replies will fall back.');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  model(tier: ModelTier): string {
    switch (tier) {
      case 'cheap':
        return this.config.get('ANTHROPIC_MODEL_CHEAP', { infer: true });
      case 'smart':
        return this.config.get('ANTHROPIC_MODEL_SMART', { infer: true });
      default:
        return this.config.get('ANTHROPIC_MODEL_BALANCED', { infer: true });
    }
  }

  /**
   * Create a message. `system` is sent as a cacheable block so the static hotel
   * context isn't re-billed every turn.
   */
  async createMessage(params: {
    tier: ModelTier;
    system: string;
    messages: Anthropic.MessageParam[];
    tools?: Anthropic.Tool[];
    maxTokens?: number;
  }): Promise<Anthropic.Message> {
    if (!this.client) {
      throw new Error('Anthropic client not configured');
    }
    return this.client.messages.create({
      model: this.model(params.tier),
      max_tokens: params.maxTokens ?? 1024,
      // Cache the static hotel-context system prompt so it isn't re-billed every
      // turn (plan.md §7.3).
      system: [
        {
          type: 'text',
          text: params.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: params.messages,
      ...(params.tools && params.tools.length > 0
        ? { tools: params.tools }
        : {}),
    });
  }
}
