'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { OfferItem, OfferStatusValue } from '@offeraccept/types';
import { cn } from '@/lib/cn';

// ─── Health indicator ──────────────────────────────────────────────────────────

type HealthState = 'expiring' | 'slow' | 'healthy' | null;

function getHealth(offer: OfferItem): HealthState {
  if (offer.status !== 'SENT') return null;
  const now = Date.now();
  const MS_DAY = 86_400_000;
  if (offer.expiresAt && new Date(offer.expiresAt).getTime() - now < MS_DAY && new Date(offer.expiresAt).getTime() > now) {
    return 'expiring';
  }
  if (now - new Date(offer.updatedAt).getTime() > 3 * MS_DAY) return 'slow';
  return 'healthy';
}

const HEALTH_META: Record<NonNullable<HealthState>, { dot: string; label: string }> = {
  expiring: { dot: 'bg-[--color-error]',   label: 'Expiring soon' },
  slow:     { dot: 'bg-[--color-warning]', label: 'Slow response' },
  healthy:  { dot: 'bg-[--color-success]', label: 'Active'        },
};

// ─── Suggested action ─────────────────────────────────────────────────────────
// Client-side derivation from offer data — no extra API calls.

type SuggestedAction = 'send_reminder' | 'urgent_expiring' | 'ready_to_send' | null;

interface SuggestedActionMeta { label: string; classes: string }

const SUGGESTED_ACTION_META: Record<NonNullable<SuggestedAction>, SuggestedActionMeta> = {
  urgent_expiring: { label: 'Expires soon',    classes: 'bg-[--color-error-light] text-[--color-error-text]' },
  send_reminder:   { label: 'Send reminder',   classes: 'bg-[--color-warning-light] text-[--color-warning-text]' },
  ready_to_send:   { label: 'Ready to send',   classes: 'bg-[--color-accent-light] text-[--color-accent-text]' },
};

function getSuggestedAction(offer: OfferItem): SuggestedAction {
  const now = Date.now();
  const MS_DAY = 86_400_000;
  if (offer.status === 'SENT') {
    if (offer.expiresAt) {
      const expiresMs = new Date(offer.expiresAt).getTime();
      if (expiresMs > now && expiresMs - now < MS_DAY) return 'urgent_expiring';
    }
    if (now - new Date(offer.updatedAt).getTime() > 3 * MS_DAY) return 'send_reminder';
  }
  if (offer.status === 'DRAFT' && offer.recipient?.email) return 'ready_to_send';
  return null;
}

function SuggestedActionChip({ offer }: { offer: OfferItem }) {
  const action = getSuggestedAction(offer);
  if (!action) return <span className="text-[--color-text-muted] text-xs">—</span>;
  const meta = SUGGESTED_ACTION_META[action];
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', meta.classes)}>
      {meta.label}
    </span>
  );
}

function HealthDot({ offer }: { offer: OfferItem }) {
  const state = getHealth(offer);
  if (!state) return null;
  const meta = HEALTH_META[state];
  return (
    <span
      className={cn('inline-block w-1.5 h-1.5 rounded-full flex-shrink-0', meta.dot)}
      title={meta.label}
      aria-label={meta.label}
    />
  );
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<OfferStatusValue, { label: string; classes: string }> = {
  DRAFT:    { label: 'Draft',    classes: 'bg-[--color-surface] text-[--color-text-secondary]' },
  SENT:     { label: 'Sent',     classes: 'bg-[--color-accent-light] text-[--color-accent-text]' },
  ACCEPTED: { label: 'Accepted', classes: 'bg-[--color-success-light] text-[--color-success-text]' },
  DECLINED: { label: 'Declined', classes: 'bg-[--color-error-light] text-[--color-error-text]' },
  EXPIRED:  { label: 'Expired',  classes: 'bg-[--color-warning-light] text-[--color-warning-text]' },
  REVOKED:  { label: 'Revoked',  classes: 'bg-[--color-surface] text-[--color-text-muted]' },
};

type FilterTab = 'ALL' | OfferStatusValue;
type SortKey = 'createdAt' | 'updatedAt' | 'status';
type SortDir = 'asc' | 'desc';

const TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'ALL',      label: 'All' },
  { key: 'DRAFT',    label: 'Draft' },
  { key: 'SENT',     label: 'Sent' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'DECLINED', label: 'Declined' },
  { key: 'EXPIRED',  label: 'Expired' },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ColumnLabels {
  title?: string;
  recipient?: string;
}

interface Props {
  offers: OfferItem[];
  loading?: boolean;
  tourId?: string;
  /** Override the section heading (default: "Offers") */
  headingLabel?: string;
  /** Override column header labels */
  columnLabels?: ColumnLabels;
}

// ─── OfferTable ────────────────────────────────────────────────────────────────

export function OfferTable({
  offers,
  loading = false,
  tourId,
  headingLabel = 'Deals',
  columnLabels = {},
}: Props) {
  const colTitle     = columnLabels.title     ?? 'Deal name';
  const colRecipient = columnLabels.recipient ?? 'Customer';
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Apply: status filter → search → sort
  const filtered = useMemo(() => {
    let result = activeTab === 'ALL' ? offers : offers.filter((o) => o.status === activeTab);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.recipient?.email?.toLowerCase().includes(q) ||
          o.recipient?.name?.toLowerCase().includes(q),
      );
    }

    result = [...result].sort((a, b) => {
      let va: string, vb: string;
      if (sortKey === 'status') {
        va = a.status; vb = b.status;
      } else if (sortKey === 'updatedAt') {
        va = a.updatedAt; vb = b.updatedAt;
      } else {
        va = a.createdAt; vb = b.createdAt;
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [offers, activeTab, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-1 text-[--color-text-muted] inline" aria-hidden="true" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-[--color-accent] inline" aria-hidden="true" />
      : <ArrowDown className="w-3 h-3 ml-1 text-[--color-accent] inline" aria-hidden="true" />;
  }

  return (
    <section
      className="bg-white rounded-xl border border-[--color-border] flex flex-col"
      aria-labelledby="offers-heading"
      {...(tourId ? { 'data-tour': tourId } : {})}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[--color-border-subtle]">
        <h2 id="offers-heading" className="text-base font-semibold text-[--color-text-primary]">
          {headingLabel}
          {!loading && (
            <span className="ml-2 text-xs font-normal text-[--color-text-muted]">
              ({filtered.length}{activeTab !== 'ALL' || search ? ` of ${offers.length}` : ''})
            </span>
          )}
        </h2>
        <Link
          href="/dashboard/offers/new"
          data-tour="create-offer"
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium btn-lift',
            'bg-[--color-accent] text-white hover:bg-[--color-accent-hover] transition-colors',
            'focus-visible:ring-2 focus-visible:ring-[--color-accent] focus-visible:ring-offset-2',
          )}
          aria-label="Create a new offer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create offer
        </Link>
      </div>

      {/* Search bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[--color-text-muted] pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by name or recipient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search offers"
            className={cn(
              'w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[--color-border]',
              'placeholder:text-[--color-text-muted] text-[--color-text-primary] bg-[--color-bg]',
              'focus:outline-none focus:ring-2 focus:ring-[--color-accent] focus:border-transparent focus:bg-white',
              'transition-colors',
            )}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[--color-text-muted] hover:text-[--color-text-secondary] transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="Filter offers by status"
        className="flex gap-0.5 px-4 pt-2 pb-0 overflow-x-auto"
      >
        {TABS.map((tab) => {
          const count = tab.key === 'ALL'
            ? offers.length
            : offers.filter((o) => o.status === tab.key).length;
          if (count === 0 && tab.key !== 'ALL') return null;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded-t-lg text-xs font-medium transition-colors relative whitespace-nowrap',
                'focus-visible:ring-2 focus-visible:ring-[--color-accent]',
                activeTab === tab.key
                  ? 'text-[--color-accent-text] bg-[--color-accent-light] border border-b-0 border-[--color-border]'
                  : 'text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-bg]',
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] px-1.5 min-w-[18px] h-[18px]',
                  activeTab === tab.key ? 'bg-[--color-accent-light] text-[--color-accent-text]' : 'bg-[--color-surface] text-[--color-text-muted]',
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
          <EmptyState hasOffers={offers.length > 0} hasSearch={search.length > 0} tab={activeTab} onClear={() => setSearch('')} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--color-border-subtle]">
                <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider w-[38%]">
                  <button
                    onClick={() => toggleSort('createdAt')}
                    className="flex items-center hover:text-[--color-text-primary] transition-colors focus-visible:ring-2 focus-visible:ring-[--color-accent] rounded cursor-pointer"
                    aria-label={`Sort by created date ${sortKey === 'createdAt' && sortDir === 'asc' ? 'descending' : 'ascending'}`}
                  >
                    {colTitle} <SortIcon col="createdAt" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider hidden sm:table-cell">
                  {colRecipient}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">
                  <button
                    onClick={() => toggleSort('status')}
                    className="flex items-center hover:text-[--color-text-primary] transition-colors focus-visible:ring-2 focus-visible:ring-[--color-accent] rounded cursor-pointer"
                    aria-label={`Sort by status`}
                  >
                    Status <SortIcon col="status" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider hidden md:table-cell">
                  <button
                    onClick={() => toggleSort('updatedAt')}
                    className="flex items-center hover:text-[--color-text-primary] transition-colors focus-visible:ring-2 focus-visible:ring-[--color-accent] rounded cursor-pointer"
                    aria-label={`Sort by last activity ${sortKey === 'updatedAt' && sortDir === 'asc' ? 'descending' : 'ascending'}`}
                  >
                    Last activity <SortIcon col="updatedAt" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider hidden xl:table-cell">
                  Suggested action
                </th>
                <th scope="col" className="sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((offer) => (
                <tr
                  key={offer.id}
                  className="table-row-hover border-b border-[--color-border-subtle] last:border-0 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <HealthDot offer={offer} />
                      <Link
                        href={`/dashboard/deals/${offer.id}`}
                        className="font-medium text-[--color-text-primary] hover:text-[--color-accent] focus-visible:ring-2 focus-visible:ring-[--color-accent] rounded transition-colors"
                      >
                        {search ? <Highlight text={offer.title} query={search} /> : offer.title}
                      </Link>
                    </div>
                    {offer.recipient?.email && (
                      <p className="text-xs text-[--color-text-muted] mt-0.5 sm:hidden truncate max-w-[200px] pl-3">
                        {offer.recipient.email}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-[--color-text-secondary] hidden sm:table-cell">
                    <span className="truncate max-w-[160px] block">
                      {offer.recipient?.email
                        ? (search ? <Highlight text={offer.recipient.email} query={search} /> : offer.recipient.email)
                        : <span className="text-[--color-text-muted]">—</span>
                      }
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={offer.status} />
                  </td>
                  <td className="px-4 py-3.5 text-[--color-text-muted] text-xs hidden md:table-cell">
                    <time dateTime={offer.updatedAt}>
                      {new Date(offer.updatedAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </time>
                  </td>
                  <td className="px-4 py-3.5 hidden xl:table-cell">
                    <SuggestedActionChip offer={offer} />
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <Link
                      href={`/dashboard/deals/${offer.id}`}
                      className="inline-flex items-center gap-1 text-xs text-[--color-text-muted] hover:text-[--color-accent] focus-visible:ring-2 focus-visible:ring-[--color-accent] rounded transition-colors"
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

// ── Highlight matching text ────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[--color-warning-light] text-[--color-warning-text] rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OfferStatusValue }) {
  const meta = STATUS_META[status] ?? { label: status, classes: 'bg-[--color-surface] text-[--color-text-secondary]' };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold transition-colors duration-200', meta.classes)}>
      {meta.label}
    </span>
  );
}

function EmptyState({
  hasOffers, hasSearch, tab, onClear,
}: {
  hasOffers: boolean;
  hasSearch: boolean;
  tab: FilterTab;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-[--color-surface] flex items-center justify-center mb-3" aria-hidden="true">
        <svg className="w-6 h-6 text-[--color-text-muted]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-[--color-text-primary]">
        {hasSearch ? 'No matching offers' : hasOffers ? `No ${tab.toLowerCase()} offers` : 'No offers yet'}
      </p>
      <p className="text-xs text-[--color-text-muted] mt-1 mb-4">
        {hasSearch
          ? 'Try a different search term.'
          : hasOffers
          ? 'Try a different filter tab above.'
          : 'Send your first deal in under 2 minutes.'}
      </p>
      {hasSearch && (
        <button
          onClick={onClear}
          className="px-4 py-2 text-sm font-medium text-[--color-accent] border border-[--color-accent-light] rounded-lg hover:bg-[--color-accent-light] transition-colors cursor-pointer"
        >
          Clear search
        </button>
      )}
      {!hasOffers && !hasSearch && (
        <Link
          href="/dashboard/offers/new"
          className="px-4 py-2 bg-[--color-accent] text-white text-sm font-medium rounded-lg hover:bg-[--color-accent-hover] focus-visible:ring-2 focus-visible:ring-[--color-accent] focus-visible:ring-offset-2 transition-colors"
        >
          Create your first offer
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
          <div className="skeleton-shimmer h-4 rounded flex-1" />
          <div className="skeleton-shimmer h-4 rounded w-32 hidden sm:block" />
          <div className="skeleton-shimmer h-5 rounded-full w-16" />
          <div className="skeleton-shimmer h-3 rounded w-20 hidden md:block" />
          <div className="skeleton-shimmer h-5 rounded-full w-24 hidden xl:block" />
        </div>
      ))}
    </div>
  );
}
