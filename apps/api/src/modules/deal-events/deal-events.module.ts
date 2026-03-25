import { Global, Module } from '@nestjs/common';
import { DealEventService } from './deal-events.service';

// ─── DealEventsModule ─────────────────────────────────────────────────────────
// @Global so every module can inject DealEventService without importing this
// module explicitly — the same pattern used by EnterpriseCoreModule for
// WebhookService and ApiKeyService.

@Global()
@Module({
  providers: [DealEventService],
  exports: [DealEventService],
})
export class DealEventsModule {}
