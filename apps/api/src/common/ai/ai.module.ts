import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';

// ─── AiModule ─────────────────────────────────────────────────────────────────
// @Global so AiService is available in any module without explicit imports.
//
// MetricsService and PRISMA tokens are injected into AiService as @Optional
// so that AiModule can be loaded in test environments without MetricsModule
// or DatabaseModule being present.
//
// No provider currently uses AiService. When an AI-backed feature is implemented:
//   1. Inject AiService into the feature service
//   2. Call isAvailable() before invoking call() to support graceful degradation
//   3. Provide a fallback response when isAvailable() returns false

@Global()
@Module({
  providers: [AiService],
  exports:   [AiService],
})
export class AiModule {}
