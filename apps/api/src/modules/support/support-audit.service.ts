import { Injectable, Logger } from '@nestjs/common';

// ─── SupportAuditService ───────────────────────────────────────────────────────
// Emits structured audit log entries for every support read and action.
//
// Audit requirement:
//   All INTERNAL_SUPPORT reads of sensitive case data and all support actions
//   must be identifiable: who did what, on which resource, at what time.
//
// Implementation:
//   Entries are emitted via NestJS Logger as structured JSON under the
//   'SupportAudit' context. In production these are captured by the log
//   aggregation pipeline (e.g., CloudWatch, Datadog) and are queryable by
//   actorId, action, and resource for dispute and compliance investigations.
//
// Sensitive data rules:
//   - actorId: the userId from the support user's JWT (always present)
//   - resource: a combination of resource type and ID (e.g., "offer:abc123")
//   - No raw tokens, OTP codes, or hashed secrets are logged
//   - IP address is logged for actions (it is already in signing events for reads)

export type SupportAuditAction =
  // Read actions — sensitive case data access
  | 'SEARCH_OFFERS'
  | 'READ_CASE'
  | 'READ_TIMELINE'
  | 'READ_SESSION_EVENTS'
  // Mutation actions
  | 'REVOKE_OFFER'
  | 'RESEND_OFFER_LINK'
  | 'RESEND_SESSION_OTP';

export interface SupportAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SupportAuditService {
  private readonly logger = new Logger('SupportAudit');

  // Log a support read or action.
  // `actorId`  — userId from the support user's JWT
  // `action`   — what was done (see SupportAuditAction)
  // `resource` — what was accessed (e.g., "offer:abc123", "session:xyz456")
  // `ctx`      — optional network context (IP, UA) for mutation actions
  // `detail`   — optional additional structured data (e.g., query params for searches)
  log(
    actorId: string,
    action: SupportAuditAction,
    resource: string,
    ctx?: SupportAuditContext,
    detail?: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        type: 'SUPPORT_AUDIT',
        actorId,
        action,
        resource,
        timestamp: new Date().toISOString(),
        ...(ctx?.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
        ...(ctx?.userAgent ? { userAgent: ctx.userAgent } : {}),
        ...(detail ? { detail } : {}),
      }),
    );
  }
}
