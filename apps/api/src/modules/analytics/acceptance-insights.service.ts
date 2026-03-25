import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { DealEventType } from '../deal-events/deal-events.service';

// ─── AcceptanceInsightsService ────────────────────────────────────────────────
// Computes actionable deal-closing intelligence from the DealEvent log.
//
// All five insights are derived from a single indexed query — events are grouped
// by dealId in memory, keeping round-trips to one regardless of insight count.
//
// Query strategy:
//   SELECT deal_events WHERE offer.organizationId = $orgId
//   Uses: deal_events.dealId index + offers.(organizationId, status) index
//
// Minimum dataset: median acceptance time requires ≥ 10 accepted deals;
// all other insights are shown as long as at least one qualifying deal exists.

export interface AcceptanceInsights {
  /** Median hours from deal_sent → deal_accepted. Null if < 10 data points. */
  medianAcceptanceHours: number | null;
  /** % of accepted deals that had deal_reminder_sent before acceptance. */
  reminderRate: number | null;
  /** Deals opened by recipient but not accepted; last event > 24 h ago. */
  openedNotAccepted: { dealId: string; dealTitle: string; hoursSinceLastEvent: number }[];
  /** Deals sent but never opened; age > 24 h. */
  unopened: { dealId: string; dealTitle: string; hoursSinceSent: number }[];
  /** Deals opened with no activity > 48 h; not in a terminal state. */
  stalled: { dealId: string; dealTitle: string; hoursSinceLastEvent: number }[];
}

const TERMINAL: DealEventType[] = ['deal_accepted', 'deal_declined', 'deal_revoked', 'deal_expired'];
const H24 = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

@Injectable()
export class AcceptanceInsightsService {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  async getInsights(orgId: string): Promise<AcceptanceInsights> {
    const now = Date.now();

    // Single query: all events for this org's non-deleted deals, oldest-first.
    // Uses deal_events.dealId index + offers.(organizationId, status) index.
    const rows = await this.db.dealEvent.findMany({
      where: {
        offer: { organizationId: orgId, deletedAt: null },
      },
      select: {
        dealId: true,
        eventType: true,
        createdAt: true,
        offer: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by dealId → sorted event list (already asc from DB)
    const byDeal = new Map<
      string,
      { title: string; events: Array<{ type: DealEventType; ts: number }> }
    >();
    for (const row of rows) {
      if (!byDeal.has(row.dealId)) {
        byDeal.set(row.dealId, { title: row.offer.title, events: [] });
      }
      byDeal.get(row.dealId)!.events.push({
        type: row.eventType as DealEventType,
        ts: row.createdAt.getTime(),
      });
    }

    // ── Compute insights ────────────────────────────────────────────────────

    const acceptanceHours: number[] = [];
    const openedNotAccepted: AcceptanceInsights['openedNotAccepted'] = [];
    const unopened: AcceptanceInsights['unopened'] = [];
    const stalled: AcceptanceInsights['stalled'] = [];
    let acceptedWithReminder = 0;
    let acceptedTotal = 0;

    for (const [dealId, { title, events }] of byDeal) {
      const types = new Set(events.map((e) => e.type));
      const lastTs = events[events.length - 1]!.ts;
      const hoursSinceLast = (now - lastTs) / 3_600_000;
      const isTerminal = TERMINAL.some((t) => types.has(t));

      const sentEvent  = events.find((e) => e.type === 'deal_sent');
      const acceptedEvent = events.find((e) => e.type === 'deal_accepted');

      // ── Insight 1 & 2: Acceptance timing + reminder rate ─────────────────
      if (acceptedEvent && sentEvent) {
        acceptedTotal++;
        const hours = (acceptedEvent.ts - sentEvent.ts) / 3_600_000;
        acceptanceHours.push(hours);

        // Reminder sent before acceptance?
        const hadReminder = events.some(
          (e) => e.type === 'deal_reminder_sent' && e.ts < acceptedEvent.ts,
        );
        if (hadReminder) acceptedWithReminder++;
      }

      // ── Insight 3: Opened but not accepted, idle > 24 h ──────────────────
      if (
        types.has('deal_opened') &&
        !types.has('deal_accepted') &&
        !isTerminal &&
        hoursSinceLast > 24
      ) {
        openedNotAccepted.push({ dealId, dealTitle: title, hoursSinceLastEvent: Math.round(hoursSinceLast) });
      }

      // ── Insight 4: Sent but never opened, age > 24 h ─────────────────────
      if (
        types.has('deal_sent') &&
        !types.has('deal_opened') &&
        !isTerminal &&
        sentEvent &&
        now - sentEvent.ts > H24
      ) {
        unopened.push({
          dealId,
          dealTitle: title,
          hoursSinceSent: Math.round((now - sentEvent.ts) / 3_600_000),
        });
      }

      // ── Insight 5: Stalled — opened, no activity > 48 h, not terminal ────
      if (
        types.has('deal_opened') &&
        !types.has('deal_accepted') &&
        !isTerminal &&
        now - lastTs > H48
      ) {
        stalled.push({ dealId, dealTitle: title, hoursSinceLastEvent: Math.round(hoursSinceLast) });
      }
    }

    return {
      medianAcceptanceHours:
        acceptanceHours.length >= 10
          ? Math.round(computeMedian(acceptanceHours) * 10) / 10
          : null,
      reminderRate:
        acceptedTotal > 0
          ? Math.round((acceptedWithReminder / acceptedTotal) * 100)
          : null,
      openedNotAccepted: openedNotAccepted.sort((a, b) => b.hoursSinceLastEvent - a.hoursSinceLastEvent),
      unopened: unopened.sort((a, b) => b.hoursSinceSent - a.hoursSinceSent),
      stalled: stalled.sort((a, b) => b.hoursSinceLastEvent - a.hoursSinceLastEvent),
    };
  }
}
