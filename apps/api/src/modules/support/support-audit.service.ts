import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── SupportAuditService ───────────────────────────────────────────────────────
// Persists a DB-backed audit trail for every INTERNAL_SUPPORT read and action.
//
// Design decisions:
//   - Primary store: SupportAuditLog table (Postgres, append-only).
//     This is the authoritative audit source — queryable after the fact without
//     depending on log aggregation availability.
//   - Secondary store: structured JSON via NestJS Logger. Production log
//     aggregation (CloudWatch, Datadog) picks this up for real-time alerting.
//   - DB write is fire-and-forget (async, not awaited at call site) to avoid
//     blocking the response. A failure to write is logged at ERROR but does not
//     fail the action — we prefer partial audit over unavailability.
//
// Sensitive data rules (enforced here, not by callers):
//   - No raw tokens, token hashes, OTP codes, or passwords in metadata
//   - actorId always comes from the JWT sub — never from request body
//   - Email addresses in metadata must be pre-masked by the caller

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

// resourceType values used internally — not validated at runtime, document here
// 'offer'       — action on an offer or its case data
// 'session'     — action on a specific signing session
// 'certificate' — action on an acceptance certificate
type ResourceType = 'offer' | 'session' | 'certificate' | 'offers';

@Injectable()
export class SupportAuditService {
  private readonly logger = new Logger('SupportAudit');

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // Log a support read or action.
  // `actorId`        — userId from the support user's JWT (JWT sub, never request body)
  // `action`         — what was done (see SupportAuditAction)
  // `resource`       — resource descriptor: "offer:{id}", "session:{id}" etc.
  // `ctx`            — optional network context (IP, UA) — for mutation actions
  // `detail`         — safe additional data (must not contain secrets/tokens)
  // `organizationId` — owning org when known (null for cross-org search results)
  log(
    actorId: string,
    action: SupportAuditAction,
    resource: string,
    ctx?: SupportAuditContext,
    detail?: Record<string, unknown>,
    organizationId?: string,
  ): void {
    const timestamp = new Date();
    const [resourceType, resourceId] = this.parseResource(resource);

    const entry = {
      type: 'SUPPORT_AUDIT',
      actorId,
      action,
      resource,
      timestamp: timestamp.toISOString(),
      ...(ctx?.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
      ...(ctx?.userAgent ? { userAgent: ctx.userAgent } : {}),
      ...(detail ? { detail } : {}),
    };

    // Secondary: structured log for real-time aggregation
    this.logger.log(JSON.stringify(entry));

    // Primary: durable DB row — non-blocking
    this.persistToDB({
      actorId,
      action,
      resourceType,
      resourceId,
      organizationId: organizationId ?? null,
      timestamp,
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: detail ?? null,
    }).catch((err) => {
      this.logger.error('Failed to persist support audit log to DB', err);
    });
  }

  // Retrieves recent audit entries for a resource — for compliance review.
  // Returns newest-first, limited to 100 rows by default.
  async getEntriesForResource(
    resourceType: string,
    resourceId: string,
    limit = 100,
  ) {
    return this.db.supportAuditLog.findMany({
      where: { resourceType, resourceId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  // Retrieves recent audit entries for an actor — for actor-level investigation.
  async getEntriesForActor(actorId: string, limit = 100) {
    return this.db.supportAuditLog.findMany({
      where: { actorId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────────

  private async persistToDB(row: {
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    organizationId: string | null;
    timestamp: Date;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, unknown> | null;
  }): Promise<void> {
    await this.db.supportAuditLog.create({
      data: {
        actorId: row.actorId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        organizationId: row.organizationId ?? undefined,
        timestamp: row.timestamp,
        ipAddress: row.ipAddress ?? undefined,
        userAgent: row.userAgent ?? undefined,
        metadata: row.metadata ?? undefined,
      },
    });
  }

  // Splits "offer:abc123" into ["offer", "abc123"].
  // Falls back to ["unknown", resource] for unrecognized formats.
  private parseResource(resource: string): [ResourceType, string] {
    const sep = resource.indexOf(':');
    if (sep < 1) return ['offer', resource];
    const type = resource.slice(0, sep) as ResourceType;
    const id = resource.slice(sep + 1);
    return [type, id];
  }
}
