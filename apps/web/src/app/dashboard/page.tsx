'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listOffers } from '../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { Button } from '../../components/ui/Button';
import { ActivityFeed } from '../../components/dashboard/ActivityFeed';
import { DealStatusList } from '../../components/dashboard/DealStatusList';
import { FirstDealEmptyState } from '../../components/dashboard/FirstDealEmptyState';
import { StatsCard, StatsCardSkeleton } from '../../components/dashboard/StatsCard';

// ─── helpers ──────────────────────────────────────────────────────────────────

function computeStats(offers: OfferItem[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonth = offers.filter((o) => new Date(o.createdAt) >= startOfMonth);
  const sentThisMonth = thisMonth.length;
  const accepted = offers.filter((o) => o.status === 'ACCEPTED').length;
  const total = offers.length;
  const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
  const needsAttention = offers.filter((o) =>
    o.status === 'SENT'
  ).length;

  return { sentThisMonth, accepted, rate, needsAttention };
}

// ─── DashboardPage ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listOffers(1, 50)
      .then(({ data }) => setOffers(data))
      .catch(() => {/* show empty state gracefully */})
      .finally(() => setLoading(false));
  }, []);

  const hasDeals = !loading && offers.length > 0;
  const stats = computeStats(offers);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--font-size-h1)] font-bold tracking-tight text-[--color-text-primary]">Dashboard</h1>
        <Link href="/dashboard/offers/new">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Create offer
          </Button>
        </Link>
      </div>

      {/* ── Micro stats ──────────────────────────────────────────────────────── */}
      {(loading || hasDeals) && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-tour="stats-row">
          {loading ? (
            <>
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </>
          ) : (
            <>
              <StatsCard
                label="Sent this month"
                value={stats.sentThisMonth}
                tourId="stat-sent"
              />
              <StatsCard
                label="Accepted"
                value={stats.accepted}
                trend="positive"
                tourId="stat-accepted"
              />
              <StatsCard
                label="Acceptance rate"
                value={`${stats.rate}%`}
                sub={stats.rate >= 50 ? '↑ On track' : '↓ Below avg'}
                trend={stats.rate >= 50 ? 'positive' : 'negative'}
                tourId="stat-rate"
              />
              <StatsCard
                label="Needs attention"
                value={stats.needsAttention}
                sub={stats.needsAttention > 0 ? 'Awaiting response' : 'All clear'}
                trend={stats.needsAttention > 0 ? 'negative' : 'positive'}
                tourId="stat-attention"
              />
            </>
          )}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {!loading && !hasDeals && (
        <FirstDealEmptyState />
      )}

      {/* ── Active dashboard ─────────────────────────────────────────────────── */}
      {(loading || hasDeals) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Offer status list — takes 2/3 width on desktop */}
          <div className="lg:col-span-2">
            <DealStatusList offers={offers} loading={loading} />
          </div>

          {/* Activity feed — takes 1/3 width on desktop */}
          <div className="lg:col-span-1">
            <ActivityFeed maxItems={12} />
          </div>

        </div>
      )}

    </div>
  );
}
