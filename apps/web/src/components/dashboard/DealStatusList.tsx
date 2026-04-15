'use client';

import Link from 'next/link';
import type { OfferItem, OfferStatusValue } from '@offeraccept/types';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/cn';

// ─── DealStatusList ───────────────────────────────────────────────────────────
// Simple deal list for the launch dashboard.
// Shows: deal name, recipient, status badge, last activity, view action.
// Intentionally minimal — no sorting, filtering, or health indicators.

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_VARIANT: Record<OfferStatusValue, 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'purple'> = {
  DRAFT:    'gray',
  SENT:     'blue',
  ACCEPTED: 'green',
  DECLINED: 'red',
  EXPIRED:  'amber',
  REVOKED:  'purple',
};

const STATUS_LABEL: Record<OfferStatusValue, string> = {
  DRAFT:    'Draft',
  SENT:     'Sent',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED:  'Expired',
  REVOKED:  'Revoked',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface DealStatusListProps {
  offers: OfferItem[];
  loading: boolean;
}

export function DealStatusList({ offers, loading }: DealStatusListProps) {
  if (loading) return <DealStatusListSkeleton />;

  return (
    <Card>
      <CardHeader title="Offers" border />

      {offers.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" aria-hidden="true" />}
          title="No offers yet"
          description="Send your first offer to collect verifiable acceptance."
          hint="Recipients don't need an account — they accept via a secure email link."
          action={{ label: 'Create offer', href: '/dashboard/offers/new' }}
          className="py-10"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Offer status list">
            <thead>
              <tr className="border-b border-[--color-border-subtle]">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Offer</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider hidden sm:table-cell">Recipient</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider hidden md:table-cell">Last activity</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider sr-only">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-border-subtle]">
              {offers.map((offer) => (
                <DealRow key={offer.id} offer={offer} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function DealRow({ offer }: { offer: OfferItem }) {
  const status = offer.status as OfferStatusValue;
  const recipientLabel = offer.recipient?.name || offer.recipient?.email || '—';

  return (
    <tr className={cn(
      'group transition-colors hover:bg-[--color-bg]',
    )}>
      {/* Deal name */}
      <td className="px-5 py-3.5">
        <Link
          href={`/dashboard/deals/${offer.id}`}
          className="font-medium text-[--color-text-primary] hover:text-[--color-accent] transition-colors line-clamp-1 focus-visible:outline-none focus-visible:text-[--color-accent]"
        >
          {offer.title}
        </Link>
      </td>

      {/* Recipient */}
      <td className="px-5 py-3.5 hidden sm:table-cell">
        <span className="text-[--color-text-secondary] text-xs truncate max-w-[160px] block">
          {recipientLabel}
        </span>
      </td>

      {/* Status */}
      <td className="px-5 py-3.5">
        <Badge variant={STATUS_VARIANT[status]} dot size="sm">
          {STATUS_LABEL[status]}
        </Badge>
      </td>

      {/* Last activity */}
      <td className="px-5 py-3.5 hidden md:table-cell">
        <span className="text-xs text-[--color-text-muted]">
          {formatRelative(offer.updatedAt)}
        </span>
      </td>

      {/* Action */}
      <td className="px-5 py-3.5 text-right">
        <Link
          href={`/dashboard/deals/${offer.id}`}
          className="text-xs font-medium text-[--color-accent] hover:text-[--color-accent-hover] opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100"
          aria-label={`View offer: ${offer.title}`}
        >
          View →
        </Link>
      </td>
    </tr>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function DealStatusListSkeleton() {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-[--color-border-subtle]">
        <div className="skeleton-shimmer h-3 w-12 rounded" />
      </div>
      <div className="divide-y divide-[--color-border-subtle]">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="skeleton-shimmer flex-1 h-3 rounded" />
            <div className="skeleton-shimmer w-24 h-3 rounded hidden sm:block" />
            <div className="skeleton-shimmer w-16 h-5 rounded-full" />
            <div className="skeleton-shimmer w-12 h-2.5 rounded hidden md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
