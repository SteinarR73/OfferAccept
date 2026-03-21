import { Module } from '@nestjs/common';
import { EnterpriseCoreModule } from './enterprise-core.module';
import { ApiKeysController } from './api-keys.controller';
import { WebhooksController } from './webhooks.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrgRoleGuard } from '../organizations/guards/org-role.guard';

// ─── EnterpriseHttpModule ──────────────────────────────────────────────────────
// HTTP transport layer for enterprise features.
//
// Registers the REST controllers for API key management and webhook endpoint
// management. These controllers depend on JwtAuthGuard (from AuthModule @Global)
// and OrgRoleGuard (from OrganizationsModule).
//
// Separated from EnterpriseCoreModule so that service-layer tests can import
// EnterpriseCoreModule without pulling in JwtAuthGuard, OrgRoleGuard, or their
// transitive dependencies (JwtService, OrgRepository, Reflector).
//
// This module is imported ONLY by AppModule. Feature modules (SigningModule,
// JobsModule) import EnterpriseCoreModule instead.
//
// Dependency graph:
//   EnterpriseHttpModule
//     ├── EnterpriseCoreModule  (@Global → ApiKeyService, WebhookService)
//     └── OrganizationsModule  (provides OrgRepository for OrgRoleGuard)

@Module({
  imports: [
    EnterpriseCoreModule,
    OrganizationsModule,
  ],
  controllers: [ApiKeysController, WebhooksController],
  // OrgRoleGuard is declared here (not just imported) because OrganizationsModule
  // does not export it. It only exports OrgRepository and MembershipService.
  // OrgRoleGuard's dependencies (Reflector + OrgRepository) are resolved via:
  //   - Reflector: provided by NestJS core
  //   - OrgRepository: exported from OrganizationsModule (imported above)
  providers: [OrgRoleGuard],
})
export class EnterpriseHttpModule {}
