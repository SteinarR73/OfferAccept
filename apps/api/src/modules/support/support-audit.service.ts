import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── SupportAuditService ───────────────────────────────────────────────────────
// Persists a DB-backed audit trail for every INTERNAL_SUPPORT read and action.
//
// Two write modes:
//
//   log()          — fire-and-forget. Used for read-only actions (searches,
//                    case views, timeline reads). A DB failure is logged at
//                    ERROR level but does not block the response.
//
//   logCritical()  — synchronous and blocking. Used for ALL mutating support
//                    actions (revoke, resend-link, resend-otp). The audit row
//                    must be written BEFORE the action executes. If the write
//                    fails the method throws, preventing the action from
//                    proceeding without an audit trail.
//
// This ensures: mutating support actions cannot complete without audit logging.
//
// Sensitive data rules:
//   - No raw tokens, token hashes, OTP codes, or passwords in metadata
//   - actorId always comes from the JWT sub — never from request body
//   - Email addresses in metadata must be pre-masked by the caller

export type SupportAuditAction =
  // Read actions — sensitive case data access
  | 'SEARCH_OFFERS'
  | 'READ_CASE'
  | 'READ_TIMELINE'
  | 'READ_SESSION_EVENTS'
  // Mutation actions (use logCritical for these)
  | 'REVOKE_OFFER'
  | 'RESEND_OFFER_LINK'
  | 'RESEND_SESSION_OTP';

export interface SupportAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

// resourceType values — not validated at runtime, documented here:
// 'offer'       — action on an offer or its case data
// 'session'     — action on a specific signing session
// 'certificate' — action on an acceptance certificate
// 'offers'      — cross-resource action (search results)
type ResourceType = 'offer' | 'session' | 'certificate' | 'offers';

@Injectable()
export class SupportAuditService {
  private readonly logger = new Logger('SupportAudit');

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // ── Fire-and-forget — for read-only actions ────────────────────────────────
  //
  // Emits structured JSON to the logger (picked up by log aggregation) and
  // schedules a DB write that does NOT block the caller. Use for reads.
  log(
    actorId: string,
    action: SupportAuditAction,
    resource: string,
    ctx?: SupportAuditContext,
    detail?: Record<string, unknown>,
    organizationId?: string,
  ): void {
    const timestamp = new Date();
    this.emitToLogger({ actorId, action, resource, timestamp, ctx, detail });

    this.persistToDB({ actorId, action, resource, timestamp, ctx, detail, organizationId }).catch(
      (err) => this.logger.error('Failed to persist support audit log to DB', err),
    );
  }

  // ── Synchronous — for mutating actions ────────────────────────────────────
  //
  // Awaits the DB write and propagates any failure to the caller.
  // Must be called and awaited BEFORE the action executes so that a DB
  // failure prevents the action from proceeding un-audited.
  //
  // Also emits to the logger so real-time alerting sees mutation events.
  async logCritical(
    actorId: string,
    action: SupportAuditAction,
    resource: string,
    ctx?: SupportAuditContext,
    detail?: Record<string, unknown>,
    organizationId?: string,
  ): Promise<void> {
    const timestamp = new Date();
    this.emitToLogger({ actorId, action, resource, timestamp, ctx, detail });
    // Blocking: throws on failure → caller must handle / bubble up
    await this.persistToDB({ actorId, action, resource, timestamp, ctx, detail, organizationId });
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  // Returns recent audit entries for a resource — for compliance review.
  async getEntriesForResource(resourceType: string, resourceId: string, limit = 100) {
    return this.db.supportAuditLog.findMany({
      where: { resourceType, resourceId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  // Returns recent audit entries for an actor — for actor-level investigation.
  async getEntriesForActor(actorId: string, limit = 100) {
    return this.db.supportAuditLog.findMany({
      where: { actorId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private emitToLogger(params: {
    actorId: string;
    action: string;
    resource: string;
    timestamp: Date;
    ctx?: SupportAuditContext;
    detail?: Record<string, unknown>;
  }): void {
    this.logger.log(
      JSON.stringify({
        type: 'SUPPORT_AUDIT',
        actorId: params.actorId,
        action: params.action,
        resource: params.resource,
        timestamp: params.timestamp.toISOString(),
        ...(params.ctx?.ipAddress ? { ipAddress: params.ctx.ipAddress } : {}),
        ...(params.ctx?.userAgent ? { userAgent: params.ctx.userAgent } : {}),
        ...(params.detail ? { detail: params.detail } : {}),
      }),
    );
  }

  private async persistToDB(params: {
    actorId: string;
    action: string;
    resource: string;
    timestamp: Date;
    ctx?: SupportAuditContext;
    detail?: Record<string, unknown>;
    organizationId?: string;
  }): Promise<void> {
    const [resourceType, resourceId] = this.parseResource(params.resource);
    await this.db.supportAuditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        resourceType,
        resourceId,
        organizationId: params.organizationId ?? undefined,
        timestamp: params.timestamp,
        ipAddress: params.ctx?.ipAddress ?? undefined,
        userAgent: params.ctx?.userAgent ?? undefined,
        metadata: (params.detail ?? undefined) as never,
      },
    });
  }

  // Splits "offer:abc123" → ["offer", "abc123"].
  private parseResource(resource: string): [ResourceType, string] {
    const sep = resource.indexOf(':');
    if (sep < 1) return ['offer', resource];
    return [resource.slice(0, sep) as ResourceType, resource.slice(sep + 1)];
  }
}
