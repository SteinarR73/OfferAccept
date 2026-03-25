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

// ─── DashboardPage ─────────────────────────────────────────────────────────────
//
// Launch dashboard — three elements only:
//   1. Send Deal CTA
//   2. Activity feed (DealEvent-powered)
//   3. Deal status list (name, recipient, status, last activity, action)
//
// All analytics panels, pipeline views, and stat cards have been moved out of
// the primary path. They remain available at /dashboard/analytics if needed.

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

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-[--color-text-primary]">Overview</h1>
        <Link href="/dashboard/deals/new">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Send deal
          </Button>
        </Link>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {!loading && !hasDeals && (
        <FirstDealEmptyState />
      )}

      {/* ── Active dashboard ─────────────────────────────────────────────────── */}
      {(loading || hasDeals) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Deal status list — takes 2/3 width on desktop */}
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
