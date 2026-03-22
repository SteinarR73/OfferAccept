'use client';

import Link from 'next/link';
import type { OfferItem } from '@offeraccept/types';
import { Card, CardHeader } from '../ui/Card';
import { OfferStatusBadge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Activity } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const STATUS_DOT: Record<string, string> = {
  DRAFT:    'bg-gray-300',
  SENT:     'bg-blue-500',
  ACCEPTED: 'bg-green-500',
  DECLINED: 'bg-red-500',
  EXPIRED:  'bg-amber-400',
  REVOKED:  'bg-purple-500',
};

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  offers: OfferItem[];
  loading?: boolean;
  maxItems?: number;
}

export function ActivityFeed({ offers, loading, maxItems = 6 }: ActivityFeedProps) {
  if (loading) return <ActivityFeedSkeleton />;

  // Sort by most-recently updated, take top N
  const items = [...offers]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, maxItems);

  return (
    <Card className="h-fit">
      <CardHeader title="Recent activity" border />

      {items.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-5 h-5" aria-hidden="true" />}
          title="No activity yet"
          description="Sent and accepted offers will appear here."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-gray-50">
          {items.map((offer) => (
            <li key={offer.id}>
              <Link
                href={`/dashboard/offers/${offer.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:bg-blue-50"
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[offer.status] ?? 'bg-gray-300'}`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{offer.title}</p>
                  <p className="text-[11px] text-[--color-text-muted] mt-0.5">
                    {formatRelative(offer.updatedAt)}
                  </p>
                </div>
                <OfferStatusBadge status={offer.status as 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED'} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <Card className="h-fit">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="skeleton h-3 w-28 rounded bg-gray-200" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
          <div className="skeleton w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-2.5 w-36 rounded bg-gray-200" />
            <div className="skeleton h-2 w-16 rounded bg-gray-100" />
          </div>
          <div className="skeleton h-4 w-14 rounded-full bg-gray-100" />
        </div>
      ))}
    </Card>
  );
}
