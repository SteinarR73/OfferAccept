'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listOffers } from '../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { StatsCard, StatsCardSkeleton } from '../../components/dashboard/StatsCard';
import { OfferTable } from '../../components/dashboard/OfferTable';
import { OnboardingBanner } from '../../components/dashboard/OnboardingBanner';
import { OnboardingTour, type TourStep } from '../../components/dashboard/OnboardingTour';
import { ActionPanel } from '../../components/dashboard/ActionPanel';
import { ActivityFeed } from '../../components/dashboard/ActivityFeed';
import { InsightsPanel } from '../../components/dashboard/InsightsPanel';
import { AcceptanceTrend } from '../../components/dashboard/AcceptanceTrend';
import { UsageProgress } from '../../components/dashboard/UsageProgress';
import { DealsPipeline } from '../../components/dashboard/DealsPipeline';
import { Button } from '../../components/ui/Button';

// ─── Tour steps ────────────────────────────────────────────────────────────────

const TOUR_STEPS: TourStep[] = [
  {
    target: 'stats-total',
    title: 'Your deals overview',
    body: 'These cards show a live summary of all your deals — total sent, accepted, pending, and your acceptance rate.',
    placement: 'bottom',
  },
  {
    target: 'create-offer',
    title: 'Create a deal',
    body: 'Click here to draft a new deal. Add the title, terms, and customer — then send with one click.',
    placement: 'bottom',
  },
  {
    target: 'offer-table',
    title: 'Track your deals',
    body: 'All deals appear here. Filter by status and click any row to view details or take action.',
    placement: 'top',
  },
  {
    target: 'billing-card',
    title: 'Plan & usage',
    body: 'Monitor how many deals you\'ve sent this month. Upgrade anytime to unlock higher limits.',
    placement: 'left',
  },
];

// ─── Derived stats ─────────────────────────────────────────────────────────────

interface Stats {
  total: number;
  accepted: number;
  pending: number;
  conversionPct: number;
}

function deriveStats(offers: OfferItem[]): Stats {
  const sent       = offers.filter((o) => o.status !== 'DRAFT');
  const accepted   = offers.filter((o) => o.status === 'ACCEPTED');
  const pending    = offers.filter((o) => o.status === 'SENT');
  const conversionPct = sent.length > 0 ? Math.round((accepted.length / sent.length) * 100) : 0;
  return { total: offers.length, accepted: accepted.length, pending: pending.length, conversionPct };
}

// ─── DashboardPage ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tourDone, setTourDone] = useState(false);

  useEffect(() => {
    // Check if tour has been seen already (avoids flash)
    setTourDone(localStorage.getItem('oa_tour_v1') === 'done');

    listOffers(1, 100)
      .then(({ data }) => setOffers(data))
      .catch(() => {/* offers failed — show empty state gracefully */})
      .finally(() => setLoading(false));
  }, []);

  const stats = deriveStats(offers);
  const isFirstSession = !loading && offers.length === 0;

  return (
    <>
      {/* Spotlight tour — rendered into body via portal */}
      {!tourDone && !loading && (
        <OnboardingTour
          steps={TOUR_STEPS}
          onDone={() => setTourDone(true)}
        />
      )}

      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* ── Page heading ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[--color-text-primary]">Overview</h1>
            <p className="text-sm text-[--color-text-muted] mt-0.5">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Link href="/dashboard/offers/new">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />} data-tour="create-offer">
              New deal
            </Button>
          </Link>
        </div>

        {/* ── Onboarding checklist (first session) ─────────────────────── */}
        {isFirstSession && (
          <OnboardingBanner completedStepIds={[]} tourId="onboarding-banner" />
        )}

        {/* ── Action panel (derived from offers, no extra API call) ──────── */}
        <ActionPanel offers={offers} loading={loading} />

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label="Deal statistics"
        >
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
                label="Total deals"
                value={stats.total}
                tourId="stats-total"
                description={`Total deals: ${stats.total}`}
              />
              <StatsCard
                label="Accepted"
                value={stats.accepted}
                trend="positive"
                sub={stats.accepted > 0 ? `${stats.conversionPct}% rate` : undefined}
                description={`Accepted deals: ${stats.accepted}`}
              />
              <StatsCard
                label="Awaiting response"
                value={stats.pending}
                trend="neutral"
                description={`Deals awaiting response: ${stats.pending}`}
              />
              <StatsCard
                label="Acceptance rate"
                value={`${stats.conversionPct}%`}
                trend={
                  stats.conversionPct >= 70 ? 'positive'
                  : stats.conversionPct >= 40 ? 'neutral'
                  : stats.total > 0 ? 'negative'
                  : 'neutral'
                }
                description={`Acceptance rate: ${stats.conversionPct}%`}
              />
            </>
          )}
        </div>

        {/* ── Deals pipeline ─────────────────────────────────────────────────── */}
        <DealsPipeline offers={offers} loading={loading} />

        {/* ── Usage progress (billing — independent fetch inside component) ─── */}
        <UsageProgress />

        {/* ── Main grid: Offer table + right sidebar ────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <OfferTable
            offers={offers}
            loading={loading}
            tourId="offer-table"
            headingLabel="Recent deals"
            columnLabels={{ title: 'Deal name', recipient: 'Customer' }}
          />
          </div>
          <div className="lg:col-span-1 flex flex-col gap-5">
            <InsightsPanel offers={offers} loading={loading} />
            <AcceptanceTrend offers={offers} loading={loading} />
            <ActivityFeed offers={offers} loading={loading} />
          </div>
        </div>
      </div>
    </>
  );
}
