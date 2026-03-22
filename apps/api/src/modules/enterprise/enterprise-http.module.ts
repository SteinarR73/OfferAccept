import { Module } from '@nestjs/common';
import { EnterpriseCoreModule } from './enterprise-core.module';
import { ApiKeysController } from './api-keys.controller';
import { WebhooksController } from './webhooks.controller';
import { ApiKeyGuard } from './api-key.guard';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrgRoleGuard } from '../organizations/guards/org-role.guard';

// ─── EnterpriseHttpModule ──────────────────────────────────────────────────────
// HTTP transport layer for enterprise features.
//
// Registers the REST controllers for API key management and webhook endpoint
// management.
//
// Guards provided here (HTTP layer only — never leak into service or job modules):
//   - ApiKeyGuard   reads X-Api-Key header, validates via ApiKeyService
//   - OrgRoleGuard  reads Membership from DB for route-level RBAC
//
// Imported ONLY by AppModule. Feature modules (SigningModule, JobsModule) import
// EnterpriseCoreModule directly for service access only.
//
// Dependency graph:
//   EnterpriseHttpModule
//     ├── EnterpriseCoreModule  → ApiKeyService, WebhookService
//     └── OrganizationsModule  → OrgRepository (for OrgRoleGuard)
//
// OrgRoleGuard is declared here because OrganizationsModule does not export it.
// ApiKeyGuard is declared here (not in EnterpriseCoreModule) because it is
// HTTP-layer infrastructure — background jobs and signing services don't need it.

@Module({
  imports: [EnterpriseCoreModule, OrganizationsModule],
  controllers: [ApiKeysController, WebhooksController],
  providers: [ApiKeyGuard, OrgRoleGuard],
  exports: [ApiKeyGuard],
})
export class EnterpriseHttpModule {}
