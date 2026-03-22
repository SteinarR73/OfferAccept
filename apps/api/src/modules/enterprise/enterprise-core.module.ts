import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { WebhookService } from './webhook.service';

// ─── EnterpriseCoreModule ──────────────────────────────────────────────────────
// Non-global service layer for enterprise features.
//
// Provides ApiKeyService and WebhookService. Consumed by:
//   - SigningModule        → WebhookService (dispatch offer.accepted)
//   - JobsModule           → WebhookService (send-webhook handler)
//   - EnterpriseHttpModule → re-imports for the HTTP layer
//
// NOT @Global — each consuming module must explicitly import this.
// Explicit imports make dependency relationships auditable and prevent
// accidental coupling via ambient globals.
//
// ApiKeyGuard lives in EnterpriseHttpModule (HTTP layer only — never in
// service-layer tests or background job workers).
//
// Dependencies resolved from global modules:
//   - 'PRISMA'   — DatabaseModule (@Global)
//   - JobService — JobsModule (@Global)

@Module({
  providers: [ApiKeyService, WebhookService],
  exports: [ApiKeyService, WebhookService],
})
export class EnterpriseCoreModule {}
