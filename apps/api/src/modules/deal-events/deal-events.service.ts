import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';

// ─── DealEventService ──────────────────────────────────────────────────────────
// Append-only lifecycle event log for the deal workflow.
//
// emit() is the only write path — it is intentionally best-effort: it catches
// all errors internally and logs a warning rather than propagating failures.
// Event emission must never break the main lifecycle action (send, accept, etc.).
//
// Hash chain (Phase 4 / MEDIUM-4):
//   Every new DealEvent is linked to its predecessor via previousEventHash.
//   emit() acquires a per-deal Postgres advisory transaction lock before reading
//   the latest sequence number, ensuring the chain is consistent even under
//   concurrent emit() calls.
//
//   Hash input (pipe-delimited, UTF-8):
//     dealId | sequenceNumber | eventType | canonicalMetadata | createdAt | prevHash
//
//   Legacy events (created before this migration) have null chain fields and are
//   treated as a pre-chain boundary by verifyChain().
//
// Usage pattern (in any service):
//   void this.dealEventService.emit(offerId, 'deal_created');
//
// Since DealEventsModule is @Global(), services can inject DealEventService
// without their own module importing DealEventsModule.

export type DealEventType =
  | 'deal_created'
  | 'deal_sent'
  | 'deal_opened'
  | 'otp_verified'
  | 'deal_accepted'
  | 'certificate_issued'
  | 'deal_reminder_sent'
  | 'deal_revoked'
  | 'deal_expired'
  | 'deal_declined';

export interface RecentDealEvent {
  id: string;
  dealId: string;
  dealTitle: string;
  eventType: DealEventType;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO 8601
}

const EVENT_LABELS: Record<DealEventType, string> = {
  'deal_created':         'Deal created',
  'deal_sent':            'Deal sent',
  'deal_opened':          'Opened by recipient',
  'otp_verified':         'Identity verified',
  'deal_accepted':        'Deal accepted',
  'certificate_issued':   'Certificate issued',
  'deal_reminder_sent':   'Reminder sent',
  'deal_revoked':         'Deal revoked',
  'deal_expired':         'Deal expired',
  'deal_declined':        'Deal declined',
};

const GENESIS_SENTINEL = 'GENESIS';

// Computes the deterministic hash for a single DealEvent chain link.
// Public so it can be imported by tests and verifyChain without creating a service instance.
export function computeDealEventHash(input: {
  dealId: string;
  sequenceNumber: number;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  previousEventHash: string | null;
}): string {
  const canonicalMetadata = input.metadata
    ? JSON.stringify(sortObjectKeys(input.metadata))
    : '';

  const hashInput = [
    input.dealId,
    String(input.sequenceNumber),
    input.eventType,
    canonicalMetadata,
    input.createdAt.toISOString(),
    input.previousEventHash ?? GENESIS_SENTINEL,
  ].join('|');

  return createHash('sha256').update(hashInput, 'utf8').digest('hex');
}

function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortObjectKeys(o[k])]));
  }
  return obj;
}

@Injectable()
export class DealEventService {
  private readonly logger = new Logger(DealEventService.name);

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  /**
   * Emit a deal lifecycle event. Best-effort: never throws.
   * Callers should use `void this.dealEventService.emit(...)` for fire-and-forget.
   *
   * Acquires a per-deal advisory transaction lock before computing the next
   * sequence number and hash, serializing concurrent emit() calls for the same deal.
   */
  async emit(
    dealId: string,
    eventType: DealEventType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Serialize concurrent emit() calls for the same deal.
        // pg_advisory_xact_lock is released automatically at transaction end.
        await (tx as unknown as PrismaClient).$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${dealId})::bigint)
        `;

        // Read the tail of the chain AFTER acquiring the lock.
        const lastEvent = await (tx as unknown as PrismaClient).dealEvent.findFirst({
          where: { dealId, NOT: { sequenceNumber: null } },
          orderBy: { sequenceNumber: 'desc' },
          select: { sequenceNumber: true, eventHash: true },
        });

        const sequenceNumber = (lastEvent?.sequenceNumber ?? 0) + 1;
        const previousEventHash = lastEvent?.eventHash ?? null;
        const createdAt = new Date();

        const eventHash = computeDealEventHash({
          dealId,
          sequenceNumber,
          eventType,
          metadata: metadata ?? null,
          createdAt,
          previousEventHash,
        });

        await (tx as unknown as PrismaClient).dealEvent.create({
          data: {
            dealId,
            eventType,
            metadata: (metadata as Prisma.InputJsonObject) ?? undefined,
            createdAt,
            sequenceNumber,
            previousEventHash,
            eventHash,
          },
        });
      });
    } catch (e: unknown) {
      this.logger.warn(`Failed to emit ${eventType} for deal ${dealId}: ${e}`);
    }
  }

  /**
   * Returns all events for a single deal, oldest first.
   * Used by getTimeline() to build the per-deal lifecycle view.
   */
  async getForDeal(dealId: string) {
    return this.db.dealEvent.findMany({
      where: { dealId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Returns the most recent events across all deals belonging to an org.
   * Newest first. Used by the activity feed.
   */
  async getRecentForOrg(orgId: string, limit = 20): Promise<RecentDealEvent[]> {
    const rows = await this.db.dealEvent.findMany({
      where: {
        offer: { organizationId: orgId, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { offer: { select: { title: true } } },
    });

    return rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      dealTitle: r.offer.title,
      eventType: r.eventType as DealEventType,
      metadata: r.metadata as Record<string, unknown> | null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Verifies the hash chain for all chained DealEvents for a deal.
   *
   * Legacy events (sequenceNumber === null) before the first chained event
   * are silently skipped — they pre-date the chain and cannot be retroactively
   * verified without their original timestamps and metadata.
   *
   * Once the first chained event is encountered, all subsequent events must
   * form a valid chain. A gap (null sequenceNumber after a chained event) is
   * reported as a break.
   */
  async verifyChain(dealId: string): Promise<{ valid: boolean; brokenAtSequence?: number }> {
    const events = await this.db.dealEvent.findMany({
      where: { dealId },
      orderBy: { createdAt: 'asc' },
    });

    // Find the first chained event (non-null sequenceNumber).
    const chainStart = events.findIndex((e) => e.sequenceNumber !== null);
    if (chainStart === -1) {
      // No chained events — pre-chain boundary, nothing to verify.
      return { valid: true };
    }

    const chainedEvents = events.slice(chainStart);
    let expectedPreviousHash: string | null = null;

    for (const event of chainedEvents) {
      if (event.sequenceNumber === null || event.eventHash === null) {
        // A null-hash event inside the chain region indicates a gap or corrupt entry.
        return { valid: false, brokenAtSequence: event.sequenceNumber ?? -1 };
      }

      // Verify previousEventHash linkage
      if (event.previousEventHash !== expectedPreviousHash) {
        return { valid: false, brokenAtSequence: event.sequenceNumber };
      }

      // Recompute and compare hash
      const expectedHash = computeDealEventHash({
        dealId: event.dealId,
        sequenceNumber: event.sequenceNumber,
        eventType: event.eventType,
        metadata: (event.metadata as Record<string, unknown>) ?? null,
        createdAt: event.createdAt,
        previousEventHash: event.previousEventHash,
      });

      if (expectedHash !== event.eventHash) {
        return { valid: false, brokenAtSequence: event.sequenceNumber };
      }

      expectedPreviousHash = event.eventHash;
    }

    return { valid: true };
  }

  /** Human-readable label for a given event type. */
  static labelFor(eventType: DealEventType): string {
    return EVENT_LABELS[eventType] ?? eventType;
  }
}
