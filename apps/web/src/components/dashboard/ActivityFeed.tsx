'use client';

import Link from 'next/link';
import type { OfferItem } from '@offeraccept/types';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Activity } from 'lucide-react';

// ─── Event types ──────────────────────────────────────────────────────────────

type EventType =
  | 'deal_created'
  | 'deal_sent'
  | 'deal_opened'
  | 'deal_accepted'
  | 'deal_declined'
  | 'deal_expired'
  | 'certificate_generated'
  | 'deal_reminder_sent';

interface ActivityEvent {
  key: string;
  type: EventType;
  label: string;     // verb phrase: "Deal created", "Deal accepted", etc.
  dealTitle: string;
  offerId: string;
  timestamp: string; // ISO — used for sort + display
}

// ─── Reminder cadence (mirrors backend constants) ─────────────────────────────
// Absolute offsets from sentAt used to derive approximate reminder timestamps.
const REMINDER_OFFSETS_MS = [
  24 * 60 * 60 * 1000,   // R1: 24 h
  72 * 60 * 60 * 1000,   // R2: 72 h
  120 * 60 * 60 * 1000,  // R3: 5 days
];

// ─── Event derivation ─────────────────────────────────────────────────────────
// Derives ordered lifecycle events from a single OfferItem.
// Timestamps are approximated from the data available (createdAt / updatedAt).

function deriveEvents(offer: OfferItem): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const { id, title, status, createdAt, updatedAt } = offer;
  const now = Date.now();

  // Every offer starts as a draft
  events.push({
    key: `${id}:created`,
    type: 'deal_created',
    label: 'Deal created',
    dealTitle: title,
    offerId: id,
    timestamp: createdAt,
  });

  // Once past DRAFT the deal was sent
  if (status !== 'DRAFT') {
    // For SENT offers updatedAt ≈ sent time.
    // For terminal statuses (ACCEPTED/DECLINED/EXPIRED/REVOKED) we don't have
    // the precise sent timestamp, so approximate as 1 minute after creation.
    const sentAt =
      status === 'SENT'
        ? updatedAt
        : new Date(new Date(createdAt).getTime() + 60_000).toISOString();

    events.push({
      key: `${id}:sent`,
      type: 'deal_sent',
      label: 'Deal sent',
      dealTitle: title,
      offerId: id,
      timestamp: sentAt,
    });

    // Derive reminder events for SENT (still active) or terminal offers.
    // Add a reminder event for each cadence offset that has already elapsed.
    // For terminal offers, only include reminders that would have been sent
    // before the terminal event (updatedAt ≈ terminal time).
    const terminalAt =
      status !== 'SENT' ? new Date(updatedAt).getTime() : null;
    const sentAtMs = new Date(sentAt).getTime();

    REMINDER_OFFSETS_MS.forEach((offsetMs, i) => {
      const reminderAt = sentAtMs + offsetMs;
      // Only include if the reminder time has passed and, for terminal deals,
      // it was before the deal reached its terminal state.
      if (reminderAt <= now && (terminalAt === null || reminderAt < terminalAt)) {
        events.push({
          key: `${id}:reminder:${i + 1}`,
          type: 'deal_reminder_sent',
          label: 'Reminder sent',
          dealTitle: title,
          offerId: id,
          timestamp: new Date(reminderAt).toISOString(),
        });
      }
    });
  }

  // Terminal outcomes
  if (status === 'ACCEPTED') {
    events.push({
      key: `${id}:accepted`,
      type: 'deal_accepted',
      label: 'Deal accepted',
      dealTitle: title,
      offerId: id,
      timestamp: updatedAt,
    });
    // Certificate is generated immediately after acceptance
    events.push({
      key: `${id}:cert`,
      type: 'certificate_generated',
      label: 'Certificate generated',
      dealTitle: title,
      offerId: id,
      timestamp: new Date(new Date(updatedAt).getTime() + 1_000).toISOString(),
    });
  } else if (status === 'DECLINED') {
    events.push({
      key: `${id}:declined`,
      type: 'deal_declined',
      label: 'Deal declined',
      dealTitle: title,
      offerId: id,
      timestamp: updatedAt,
    });
  } else if (status === 'EXPIRED') {
    events.push({
      key: `${id}:expired`,
      type: 'deal_expired',
      label: 'Deal expired',
      dealTitle: title,
      offerId: id,
      timestamp: updatedAt,
    });
  }

  return events;
}

// ─── Presentation helpers ─────────────────────────────────────────────────────

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EVENT_DOT: Record<EventType, string> = {
  deal_created:          'bg-gray-400',
  deal_sent:             'bg-blue-500',
  deal_opened:           'bg-indigo-400',
  deal_accepted:         'bg-green-500',
  deal_declined:         'bg-red-500',
  deal_expired:          'bg-amber-400',
  certificate_generated: 'bg-emerald-600',
  deal_reminder_sent:    'bg-orange-400',
};

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  offers: OfferItem[];
  loading?: boolean;
  /** Maximum events to show. Default: 8 */
  maxItems?: number;
}

export function ActivityFeed({ offers, loading, maxItems = 8 }: ActivityFeedProps) {
  if (loading) return <ActivityFeedSkeleton />;

  // Derive all events, sort newest-first, take top N
  const events = offers
    .flatMap(deriveEvents)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxItems);

  return (
    <Card className="h-fit">
      <CardHeader title="Activity" border />

      {events.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-5 h-5" aria-hidden="true" />}
          title="No activity yet"
          description="Create and send your first deal to see activity here."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-gray-50" aria-label="Deal activity feed">
          {events.map((event) => (
            <li key={event.key}>
              <Link
                href={`/dashboard/offers/${event.offerId}`}
                className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:bg-blue-50"
              >
                {/* Status dot */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${EVENT_DOT[event.type]}`}
                  aria-hidden="true"
                />

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 leading-snug">
                    {event.label}
                    {' '}
                    <span className="font-normal text-[--color-text-secondary] truncate">
                      — {event.dealTitle}
                    </span>
                  </p>
                  <p className="text-[11px] text-[--color-text-muted] mt-0.5">
                    {formatRelative(event.timestamp)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function ActivityFeedSkeleton() {
  return (
    <Card className="h-fit">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="skeleton h-3 w-16 rounded bg-gray-200" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
          <div className="skeleton w-2 h-2 rounded-full bg-gray-200 flex-shrink-0 mt-1.5" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-2.5 w-48 rounded bg-gray-200" />
            <div className="skeleton h-2 w-12 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </Card>
  );
}
