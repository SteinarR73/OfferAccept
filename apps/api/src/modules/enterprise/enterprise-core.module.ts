import { Global, Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { WebhookService } from './webhook.service';

// ─── EnterpriseCoreModule ──────────────────────────────────────────────────────
// @Global() service layer for enterprise features.
//
// Provides ApiKeyService, ApiKeyGuard, and WebhookService to the entire
// application without requiring every consuming module to import this module.
//
// NO controllers. NO HTTP guards (OrgRoleGuard, JwtAuthGuard).
// This keeps the service layer testable in isolation — test modules that need
// ApiKeyService or WebhookService can import only EnterpriseCoreModule without
// pulling in JwtAuthGuard, OrgRoleGuard, or their transitive dependencies.
//
// Dependencies (resolved via @Global() from the application module graph):
//   - 'PRISMA'     — DatabaseModule (@Global)
//   - JobService   — JobsModule (@Global)
//
// Consumers:
//   - SigningFlowService            → WebhookService (dispatch offer.accepted)
//   - IssueCertificateHandler       → WebhookService (dispatch certificate.issued)
//   - SendWebhookHandler            → WebhookService (endpoint lookup, delivery log)
//   - EnterpriseHttpModule          → re-imports this for HTTP layer
//   - Any route guard needing API key auth → ApiKeyGuard

@Global()
@Module({
  providers: [ApiKeyService, ApiKeyGuard, WebhookService],
  exports: [ApiKeyService, ApiKeyGuard, WebhookService],
})
export class EnterpriseCoreModule {}
