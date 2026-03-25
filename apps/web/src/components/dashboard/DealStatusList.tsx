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
      <CardHeader title="Deals" border />

      {offers.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" aria-hidden="true" />}
          title="No deals yet"
          description="Send your first deal to get started."
          className="py-10"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Deal status list">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Deal</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Recipient</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Last activity</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider sr-only">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
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
      'group transition-colors hover:bg-gray-50',
    )}>
      {/* Deal name */}
      <td className="px-5 py-3.5">
        <Link
          href={`/dashboard/offers/${offer.id}`}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors line-clamp-1 focus-visible:outline-none focus-visible:text-blue-600"
        >
          {offer.title}
        </Link>
      </td>

      {/* Recipient */}
      <td className="px-5 py-3.5 hidden sm:table-cell">
        <span className="text-gray-500 text-xs truncate max-w-[160px] block">
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
        <span className="text-xs text-gray-400">
          {formatRelative(offer.updatedAt)}
        </span>
      </td>

      {/* Action */}
      <td className="px-5 py-3.5 text-right">
        <Link
          href={`/dashboard/offers/${offer.id}`}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100"
          aria-label={`View deal: ${offer.title}`}
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
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="h-3 w-12 rounded bg-gray-200 animate-pulse" />
      </div>
      <div className="divide-y divide-gray-50">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="flex-1 h-3 rounded bg-gray-200 animate-pulse" />
            <div className="w-24 h-3 rounded bg-gray-100 animate-pulse hidden sm:block" />
            <div className="w-16 h-5 rounded-full bg-gray-100 animate-pulse" />
            <div className="w-12 h-2.5 rounded bg-gray-100 animate-pulse hidden md:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
