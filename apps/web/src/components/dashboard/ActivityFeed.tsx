'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Activity } from 'lucide-react';
import { getRecentEvents, type RecentDealEvent, type DealEventType } from '../../lib/offers-api';

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

// Verb label — short, action-first, present tense where natural
const EVENT_LABEL: Record<DealEventType, string> = {
  'deal.created':          'Offer created',
  'deal.sent':             'Offer sent',
  'deal.opened':           'Offer opened',
  'otp.verified':          'Identity verified',
  'deal.accepted':         'Offer accepted',
  'certificate.issued':    'Certificate issued',
  'deal.reminder_sent':    'Reminder sent',
  'deal.revoked':          'Offer revoked',
  'deal.expired':          'Offer expired',
  'deal.declined':         'Offer declined',
};

// Semantic accent dot per event type
const EVENT_DOT: Record<DealEventType, string> = {
  'deal.created':          'bg-[--color-neutral-text]',
  'deal.sent':             'bg-[--color-info]',
  'deal.opened':           'bg-[--color-info]',
  'otp.verified':          'bg-[--color-accent]',
  'deal.accepted':         'bg-[--color-success]',
  'certificate.issued':    'bg-[--color-accent]',
  'deal.reminder_sent':    'bg-[--color-warning]',
  'deal.revoked':          'bg-[--color-purple]',
  'deal.expired':          'bg-[--color-warning]',
  'deal.declined':         'bg-[--color-error]',
};

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  /** Maximum events to show. Default: 8 */
  maxItems?: number;
}

export function ActivityFeed({ maxItems = 8 }: ActivityFeedProps) {
  const [events, setEvents] = useState<RecentDealEvent[] | null>(null);

  useEffect(() => {
    getRecentEvents(maxItems).then(setEvents).catch(() => setEvents([]));
  }, [maxItems]);

  if (events === null) return <ActivityFeedSkeleton />;

  return (
    <Card className="h-fit">
      <CardHeader title="Activity" border />

      {events.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-5 h-5" aria-hidden="true" />}
          title="No activity yet"
          description="Create and send your first offer to see live activity here."
          hint="Events like opens, verifications, and acceptances will appear here in real time."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-[--color-border-subtle]" aria-label="Offer activity feed">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/dashboard/deals/${event.dealId}`}
                className="flex items-start gap-3 px-5 py-3 hover:bg-[--color-hover] transition-colors focus-visible:outline-none focus-visible:bg-[--color-focus]"
              >
                {/* Semantic accent dot */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 mt-[5px] ${EVENT_DOT[event.eventType] ?? 'bg-[--color-neutral-text]'}`}
                  aria-hidden="true"
                />

                {/* Verb + deal title on separate lines */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[--color-text-primary] leading-snug">
                    {EVENT_LABEL[event.eventType] ?? event.eventType.replace(/[._]/g, ' ')}
                  </p>
                  <p className="text-[11px] text-[--color-text-secondary] mt-0.5 truncate leading-snug">
                    {event.dealTitle}
                  </p>
                  <p className="text-[11px] text-[--color-text-muted] mt-0.5">
                    {formatRelative(event.createdAt)}
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
      <div className="px-5 py-4 border-b border-[--color-border-subtle]">
        <div className="skeleton-shimmer h-3 w-16 rounded" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3 border-b border-[--color-border-subtle] last:border-0">
          <div className="skeleton-shimmer w-2 h-2 rounded-full flex-shrink-0 mt-[5px]" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton-shimmer h-2.5 w-24 rounded" />
            <div className="skeleton-shimmer h-2.5 w-40 rounded" />
            <div className="skeleton-shimmer h-2 w-12 rounded" />
          </div>
        </div>
      ))}
    </Card>
  );
}
