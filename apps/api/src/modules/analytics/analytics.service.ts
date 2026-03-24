import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─── AnalyticsService ─────────────────────────────────────────────────────────
// Computes org-scoped analytics derived from existing offer + acceptance data.
//
// All queries are scoped to orgId — cross-org data is never exposed.
//
// Data sources used:
//   Offer.status + groupBy    → status counts
//   AcceptanceRecord.acceptedAt + OfferSnapshot.frozenAt → acceptance timing
//   (Reminder proxy: accepted > 24h after sent = first reminder would have fired)
//
// No separate analytics model is introduced — all metrics are derived from
// the existing deal lifecycle data.

export interface AnalyticsOverview {
  // Deal counts by lifecycle state
  dealsSent: number;       // all non-DRAFT offers
  dealsAccepted: number;
  dealsPending: number;    // SENT (awaiting response)
  dealsDeclined: number;
  dealsExpired: number;
  dealsRevoked: number;

  // Acceptance timing (null if insufficient data)
  avgAcceptanceHours: number | null;    // mean time from sent to accepted
  medianAcceptanceHours: number | null; // median — shown only when ≥ 10 data points

  // Reminder effectiveness proxy
  // Approximation: deals accepted > 24h after sent "would have" received R1
  acceptedAfterReminderCount: number;
  acceptedWithReminderPct: number | null; // null if 0 accepted deals
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  async getOverview(orgId: string): Promise<AnalyticsOverview> {
    // ── 1. Status counts ─────────────────────────────────────────────────────
    const statusGroups = await this.db.offer.groupBy({
      by: ['status'],
      where: { organizationId: orgId, deletedAt: null },
      _count: { id: true },
    });

    const counts = {
      DRAFT: 0, SENT: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0, REVOKED: 0,
    };
    for (const g of statusGroups) {
      const key = g.status as keyof typeof counts;
      if (key in counts) counts[key] = g._count.id;
    }

    const dealsSent =
      counts.SENT + counts.ACCEPTED + counts.DECLINED + counts.EXPIRED + counts.REVOKED;

    // ── 2. Acceptance timing ──────────────────────────────────────────────────
    // Join AcceptanceRecord (acceptedAt) → OfferSnapshot (frozenAt = sentAt)
    // filtered by org scope.
    const pairs = await this.db.acceptanceRecord.findMany({
      where: {
        snapshot: {
          offer: { organizationId: orgId, deletedAt: null },
        },
      },
      select: {
        acceptedAt: true,
        snapshot: { select: { frozenAt: true } },
      },
    });

    const diffHours = pairs.map((p) =>
      (p.acceptedAt.getTime() - p.snapshot.frozenAt.getTime()) / 3_600_000,
    );

    const avgAcceptanceHours =
      diffHours.length > 0
        ? Math.round((diffHours.reduce((a, b) => a + b, 0) / diffHours.length) * 10) / 10
        : null;

    // Median shown only when dataset is large enough for statistical meaning
    const medianAcceptanceHours =
      diffHours.length >= 10
        ? Math.round(computeMedian(diffHours) * 10) / 10
        : null;

    // ── 3. Reminder effectiveness (proxy) ────────────────────────────────────
    // Deals accepted more than 24h after being sent would have received R1.
    // This approximates "required a reminder to close" without a separate log.
    const FIRST_REMINDER_MS = 24 * 60 * 60 * 1000;
    const acceptedAfterReminderCount = pairs.filter(
      (p) => p.acceptedAt.getTime() - p.snapshot.frozenAt.getTime() > FIRST_REMINDER_MS,
    ).length;

    const acceptedWithReminderPct =
      counts.ACCEPTED > 0
        ? Math.round((acceptedAfterReminderCount / counts.ACCEPTED) * 100)
        : null;

    return {
      dealsSent,
      dealsAccepted: counts.ACCEPTED,
      dealsPending: counts.SENT,
      dealsDeclined: counts.DECLINED,
      dealsExpired: counts.EXPIRED,
      dealsRevoked: counts.REVOKED,
      avgAcceptanceHours,
      medianAcceptanceHours,
      acceptedAfterReminderCount,
      acceptedWithReminderPct,
    };
  }
}
