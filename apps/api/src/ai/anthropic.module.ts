import { Global, Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';

/**
 * Global provider for the Anthropic client so any module (AI orchestrator,
 * marketing, reviews, GM) can inject it without creating circular module
 * dependencies.
 */
@Global()
@Module({
  providers: [AnthropicService],
  exports: [AnthropicService],
})
export class AnthropicModule {}
