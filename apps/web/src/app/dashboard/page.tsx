'use client';

import { useEffect, useState } from 'react';
import { listOffers } from '../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { StatsCard, StatsCardSkeleton } from '../../components/dashboard/StatsCard';
import { OfferTable } from '../../components/dashboard/OfferTable';
import { BillingCard } from '../../components/dashboard/BillingCard';
import { OnboardingBanner } from '../../components/dashboard/OnboardingBanner';
import { OnboardingTour, type TourStep } from '../../components/dashboard/OnboardingTour';

// ─── Tour steps ────────────────────────────────────────────────────────────────

const TOUR_STEPS: TourStep[] = [
  {
    target: 'stats-total',
    title: 'Your offer overview',
    body: 'These cards show a live summary of all your offers — total sent, accepted, pending, and your acceptance rate.',
    placement: 'bottom',
  },
  {
    target: 'create-offer',
    title: 'Create an offer',
    body: 'Click here to draft a new offer. Add the job title, terms, and recipient — then send with one click.',
    placement: 'bottom',
  },
  {
    target: 'offer-table',
    title: 'Track your offers',
    body: 'All offers appear here. Filter by status and click any row to view details or take action.',
    placement: 'top',
  },
  {
    target: 'billing-card',
    title: 'Plan & usage',
    body: 'Monitor how many offers you\'ve used this month. Upgrade anytime to unlock higher limits.',
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
  const sent = offers.filter((o) => o.status !== 'DRAFT');
  const accepted = offers.filter((o) => o.status === 'ACCEPTED');
  const pending = offers.filter((o) => o.status === 'SENT');
  const conversionPct = sent.length > 0 ? Math.round((accepted.length / sent.length) * 100) : 0;
  return {
    total: offers.length,
    accepted: accepted.length,
    pending: pending.length,
    conversionPct,
  };
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
        <div>
          <h1 className="text-xl font-bold text-gray-900">Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* ── Onboarding checklist (first session) ─────────────────────── */}
        {isFirstSession && (
          <OnboardingBanner
            completedStepIds={[]}
            tourId="onboarding-banner"
          />
        )}

        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          aria-label="Offer statistics"
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
                label="Total offers"
                value={stats.total}
                tourId="stats-total"
                description={`Total offers: ${stats.total}`}
              />
              <StatsCard
                label="Accepted"
                value={stats.accepted}
                trend="positive"
                sub={stats.accepted > 0 ? `${stats.conversionPct}% rate` : undefined}
                description={`Accepted offers: ${stats.accepted}`}
              />
              <StatsCard
                label="Pending"
                value={stats.pending}
                trend={stats.pending > 0 ? 'neutral' : 'neutral'}
                description={`Pending offers: ${stats.pending}`}
              />
              <StatsCard
                label="Acceptance rate"
                value={`${stats.conversionPct}%`}
                trend={
                  stats.conversionPct >= 70
                    ? 'positive'
                    : stats.conversionPct >= 40
                    ? 'neutral'
                    : stats.total > 0
                    ? 'negative'
                    : 'neutral'
                }
                description={`Acceptance rate: ${stats.conversionPct}%`}
              />
            </>
          )}
        </div>

        {/* ── Main grid: Offer table + Billing sidebar ──────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Offer table — takes 2/3 on desktop */}
          <div className="lg:col-span-2">
            <OfferTable
              offers={offers}
              loading={loading}
              tourId="offer-table"
            />
          </div>

          {/* Billing card — 1/3 on desktop */}
          <div className="lg:col-span-1">
            <BillingCard tourId="billing-card" />
          </div>
        </div>
      </div>
    </>
  );
}
