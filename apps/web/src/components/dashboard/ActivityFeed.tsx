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

const EVENT_LABEL: Record<DealEventType, string> = {
  deal_created:          'Deal created',
  deal_sent:             'Deal sent',
  deal_opened:           'Opened by recipient',
  otp_verified:          'Identity verified',
  deal_accepted:         'Deal accepted',
  certificate_generated: 'Certificate generated',
  deal_reminder_sent:    'Reminder sent',
  deal_revoked:          'Deal revoked',
  deal_expired:          'Deal expired',
  deal_declined:         'Deal declined',
};

const EVENT_DOT: Record<DealEventType, string> = {
  deal_created:          'bg-gray-400',
  deal_sent:             'bg-blue-500',
  deal_opened:           'bg-indigo-400',
  otp_verified:          'bg-indigo-500',
  deal_accepted:         'bg-green-500',
  certificate_generated: 'bg-emerald-600',
  deal_reminder_sent:    'bg-orange-400',
  deal_revoked:          'bg-purple-500',
  deal_expired:          'bg-amber-400',
  deal_declined:         'bg-red-500',
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
          description="Create and send your first deal to see activity here."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-gray-50" aria-label="Deal activity feed">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/dashboard/offers/${event.dealId}`}
                className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:bg-blue-50"
              >
                {/* Status dot */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${EVENT_DOT[event.eventType] ?? 'bg-gray-400'}`}
                  aria-hidden="true"
                />

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 leading-snug">
                    {EVENT_LABEL[event.eventType] ?? event.eventType}
                    {' '}
                    <span className="font-normal text-[--color-text-secondary] truncate">
                      — {event.dealTitle}
                    </span>
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
