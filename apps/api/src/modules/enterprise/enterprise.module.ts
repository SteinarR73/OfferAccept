// ─── Backward-compatibility re-export ─────────────────────────────────────────
// EnterpriseModule has been split into:
//
//   EnterpriseCoreModule  — @Global() services (ApiKeyService, WebhookService,
//                           ApiKeyGuard). Import this in feature modules and tests.
//
//   EnterpriseHttpModule  — controllers + OrgRoleGuard. Import this in AppModule only.
//
// This file re-exports EnterpriseCoreModule as EnterpriseModule so that existing
// imports are not broken. New code should import EnterpriseCoreModule directly.

export { EnterpriseCoreModule as EnterpriseModule } from './enterprise-core.module';
