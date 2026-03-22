'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { OfferItem, OfferStatusValue } from '@offeracept/types';
import { cn } from '@/lib/cn';

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<OfferStatusValue, { label: string; classes: string }> = {
  DRAFT:    { label: 'Draft',    classes: 'bg-gray-100 text-gray-600' },
  SENT:     { label: 'Sent',     classes: 'bg-blue-100 text-blue-700' },
  ACCEPTED: { label: 'Accepted', classes: 'bg-green-100 text-green-700' },
  DECLINED: { label: 'Declined', classes: 'bg-red-100 text-red-600' },
  EXPIRED:  { label: 'Expired',  classes: 'bg-amber-100 text-amber-700' },
  REVOKED:  { label: 'Revoked',  classes: 'bg-purple-100 text-purple-700' },
};

type FilterTab = 'ALL' | OfferStatusValue;

const TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'ALL',      label: 'All' },
  { key: 'DRAFT',    label: 'Draft' },
  { key: 'SENT',     label: 'Sent' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'DECLINED', label: 'Declined' },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  offers: OfferItem[];
  loading?: boolean;
  tourId?: string;
}

// ─── OfferTable ────────────────────────────────────────────────────────────────

export function OfferTable({ offers, loading = false, tourId }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const filtered = activeTab === 'ALL'
    ? offers
    : offers.filter((o) => o.status === activeTab);

  return (
    <section
      className="bg-white rounded-xl border border-gray-200 flex flex-col"
      aria-labelledby="offers-heading"
      {...(tourId ? { 'data-tour': tourId } : {})}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 id="offers-heading" className="text-base font-semibold text-gray-900">
          Offers
          {!loading && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({filtered.length}{activeTab !== 'ALL' ? ` of ${offers.length}` : ''})
            </span>
          )}
        </h2>
        <Link
          href="/dashboard/offers/new"
          data-tour="create-offer"
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-blue-600 text-white hover:bg-blue-700 transition-colors',
            'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
          )}
          aria-label="Create a new offer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New offer
        </Link>
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="Filter offers by status"
        className="flex gap-0.5 px-4 pt-3 pb-0"
      >
        {TABS.map((tab) => {
          const count = tab.key === 'ALL'
            ? offers.length
            : offers.filter((o) => o.status === tab.key).length;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors relative',
                'focus-visible:ring-2 focus-visible:ring-blue-500',
                activeTab === tab.key
                  ? 'text-blue-700 bg-blue-50 border border-b-0 border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] px-1.5 min-w-[18px] h-[18px]',
                  activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div
        className="overflow-x-auto"
        role="tabpanel"
        aria-label={`${activeTab === 'ALL' ? 'All offers' : STATUS_META[activeTab as OfferStatusValue]?.label ?? activeTab} offers`}
      >
        {loading ? (
          <OfferTableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState hasOffers={offers.length > 0} tab={activeTab} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[40%]">
                  Title
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Recipient
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Created
                </th>
                <th scope="col" className="sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((offer) => (
                <tr
                  key={offer.id}
                  className="table-row-hover border-b border-gray-50 last:border-0 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/dashboard/offers/${offer.id}`}
                      className="font-medium text-gray-900 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 rounded transition-colors"
                    >
                      {offer.title}
                    </Link>
                    {/* Show recipient on mobile below title */}
                    {offer.recipient?.email && (
                      <p className="text-xs text-gray-400 mt-0.5 sm:hidden truncate max-w-[200px]">
                        {offer.recipient.email}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 hidden sm:table-cell">
                    <span className="truncate max-w-[160px] block">
                      {offer.recipient?.email ?? <span className="text-gray-300">—</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={offer.status} />
                  </td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs hidden md:table-cell">
                    <time dateTime={offer.createdAt}>
                      {new Date(offer.createdAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </time>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <Link
                      href={`/dashboard/offers/${offer.id}`}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      aria-label={`Open offer: ${offer.title}`}
                    >
                      Open
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OfferStatusValue }) {
  const meta = STATUS_META[status] ?? { label: status, classes: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', meta.classes)}
    >
      {meta.label}
    </span>
  );
}

function EmptyState({ hasOffers, tab }: { hasOffers: boolean; tab: FilterTab }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3" aria-hidden="true">
        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-900">
        {hasOffers ? `No ${tab.toLowerCase()} offers` : 'No offers yet'}
      </p>
      <p className="text-xs text-gray-400 mt-1 mb-4">
        {hasOffers
          ? 'Try a different filter tab above.'
          : 'Create your first offer to get started.'}
      </p>
      {!hasOffers && (
        <Link
          href="/dashboard/offers/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
        >
          Create first offer
        </Link>
      )}
    </div>
  );
}

function OfferTableSkeleton() {
  return (
    <div className="px-5 py-4 space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton h-4 bg-gray-200 rounded flex-1" />
          <div className="skeleton h-4 bg-gray-200 rounded w-32 hidden sm:block" />
          <div className="skeleton h-5 bg-gray-200 rounded-full w-16" />
          <div className="skeleton h-3 bg-gray-200 rounded w-20 hidden md:block" />
        </div>
      ))}
    </div>
  );
}
