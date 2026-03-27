import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── AnalyticsService ─────────────────────────────────────────────────────────
// Computes org-scoped analytics derived exclusively from the DealEvent log.
//
// All queries are scoped to orgId — cross-org data is never exposed.
//
// Data sources used:
//   DealEvent (deal_sent, deal_accepted, deal_declined, deal_expired, deal_revoked)
//   — the canonical append-only lifecycle log defined in schema.prisma.
//
// Design decision: DealEvent is the single source of truth for all analytics
// rather than Offer.status (a denormalized cache) or AcceptanceRecord (a
// secondary table). This ensures analytics and the activity feed always agree.
//
// Performance note: all queries filter via the nested `offer.organizationId`
// relation, which Prisma translates to a JOIN — no full-table scans.

export interface AnalyticsOverview {
  // Deal counts by lifecycle state
  dealsSent: number;       // distinct deals that have a deal_sent event
  dealsAccepted: number;
  dealsPending: number;    // sent and not yet in a terminal state
  dealsDeclined: number;
  dealsExpired: number;
  dealsRevoked: number;

  // Acceptance timing (null if insufficient data)
  avgAcceptanceHours: number | null;    // mean time from first sent to accepted
  medianAcceptanceHours: number | null; // median — shown only when ≥ 10 data points

  // Reminder effectiveness proxy
  // Deals accepted > 24h after first sent "would have" received R1
  acceptedAfterReminderCount: number;
  acceptedWithReminderPct: number | null; // null if 0 accepted deals
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Returns the set of distinct dealIds that have at least one event of the given type, scoped to orgId. */
async function dealIdsWithEvent(
  db: PrismaClient,
  orgId: string,
  eventType: string,
): Promise<Set<string>> {
  const rows = await db.dealEvent.findMany({
    where: {
      eventType: eventType as never,
      offer: { organizationId: orgId, deletedAt: null },
    },
    select: { dealId: true },
    distinct: ['dealId'],
  });
  return new Set(rows.map((r) => r.dealId));
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  async getOverview(orgId: string): Promise<AnalyticsOverview> {
    // ── 1. Status counts from DealEvent ──────────────────────────────────────
    const [sentSet, acceptedSet, declinedSet, expiredSet, revokedSet] = await Promise.all([
      dealIdsWithEvent(this.db, orgId, 'deal_sent'),
      dealIdsWithEvent(this.db, orgId, 'deal_accepted'),
      dealIdsWithEvent(this.db, orgId, 'deal_declined'),
      dealIdsWithEvent(this.db, orgId, 'deal_expired'),
      dealIdsWithEvent(this.db, orgId, 'deal_revoked'),
    ]);

    const terminalSet = new Set([...acceptedSet, ...declinedSet, ...expiredSet, ...revokedSet]);

    const dealsSent    = sentSet.size;
    const dealsAccepted = acceptedSet.size;
    const dealsDeclined = declinedSet.size;
    const dealsExpired  = expiredSet.size;
    const dealsRevoked  = revokedSet.size;
    const dealsPending  = [...sentSet].filter((id) => !terminalSet.has(id)).length;

    // ── 2. Acceptance timing from DealEvent ───────────────────────────────────
    // Use the first deal_sent and the deal_accepted event for each accepted deal.
    const acceptedIds = [...acceptedSet];
    if (acceptedIds.length === 0) {
      return {
        dealsSent, dealsAccepted, dealsPending, dealsDeclined, dealsExpired, dealsRevoked,
        avgAcceptanceHours: null, medianAcceptanceHours: null,
        acceptedAfterReminderCount: 0, acceptedWithReminderPct: null,
      };
    }

    const [sentTimings, acceptedTimings] = await Promise.all([
      this.db.dealEvent.findMany({
        where: { dealId: { in: acceptedIds }, eventType: 'deal_sent' },
        select: { dealId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.dealEvent.findMany({
        where: { dealId: { in: acceptedIds }, eventType: 'deal_accepted' },
        select: { dealId: true, createdAt: true },
      }),
    ]);

    // Map dealId → first sent timestamp
    const firstSentAt = new Map<string, Date>();
    for (const e of sentTimings) {
      if (!firstSentAt.has(e.dealId)) firstSentAt.set(e.dealId, e.createdAt);
    }
    // Map dealId → accepted timestamp
    const acceptedAt = new Map(acceptedTimings.map((e) => [e.dealId, e.createdAt]));

    const diffHours: number[] = [];
    for (const [dealId, sentAt] of firstSentAt.entries()) {
      const acc = acceptedAt.get(dealId);
      if (acc) diffHours.push((acc.getTime() - sentAt.getTime()) / 3_600_000);
    }

    const avgAcceptanceHours =
      diffHours.length > 0
        ? Math.round((diffHours.reduce((a, b) => a + b, 0) / diffHours.length) * 10) / 10
        : null;

    const medianAcceptanceHours =
      diffHours.length >= 10
        ? Math.round(computeMedian(diffHours) * 10) / 10
        : null;

    // ── 3. Reminder effectiveness (proxy) ────────────────────────────────────
    // Deals accepted more than 24 h after first send "would have" received R1.
    const FIRST_REMINDER_H = 24;
    const acceptedAfterReminderCount = diffHours.filter((h) => h > FIRST_REMINDER_H).length;

    const acceptedWithReminderPct =
      dealsAccepted > 0
        ? Math.round((acceptedAfterReminderCount / dealsAccepted) * 100)
        : null;

    return {
      dealsSent, dealsAccepted, dealsPending, dealsDeclined, dealsExpired, dealsRevoked,
      avgAcceptanceHours, medianAcceptanceHours,
      acceptedAfterReminderCount, acceptedWithReminderPct,
    };
  }
}
