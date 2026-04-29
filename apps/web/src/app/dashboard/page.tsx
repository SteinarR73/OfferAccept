'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listOffers } from '../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { Button } from '../../components/ui/Button';
import { ActivityFeed } from '../../components/dashboard/ActivityFeed';
import { DealStatusList } from '../../components/dashboard/DealStatusList';
import { FirstDealEmptyState } from '../../components/dashboard/FirstDealEmptyState';
import { StatsCard, StatsCardSkeleton } from '../../components/dashboard/StatsCard';
import { useFirstDealOnboarding } from '../../hooks/useFirstDealOnboarding';
import { FirstDealOnboarding } from '../../components/onboarding/FirstDealOnboarding';
import { OnboardingBanner } from '../../components/onboarding/OnboardingBanner';
import { DealSentSuccessBanner } from '../../components/onboarding/DealSentSuccessBanner';
import { TryYourselfModal } from '../../components/dashboard/TryYourselfModal';

// ─── First-deal detection keys ────────────────────────────────────────────────
// When the dashboard loads with 0 offers we set HAD_ZERO_KEY.
// On the next visit (after the wizard redirects back) we detect the transition
// from 0→1 and surface the success banner for the new deal.

const HAD_ZERO_KEY       = 'oa_had_zero_offers';
const SUCCESS_BANNER_KEY = 'oa_first_deal_meta';

interface FirstDealMeta {
  id: string;
  title: string;
  recipientEmail?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function computeStats(offers: OfferItem[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonth = offers.filter((o) => new Date(o.createdAt) >= startOfMonth);
  const sentThisMonth = thisMonth.length;
  const accepted = offers.filter((o) => o.status === 'ACCEPTED').length;
  const total = offers.length;
  const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
  const needsAttention = offers.filter((o) => o.status === 'SENT').length;

  return { sentThisMonth, accepted, rate, needsAttention };
}

// ─── DashboardPage ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstDealMeta, setFirstDealMeta] = useState<FirstDealMeta | null>(null);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [tryYourselfOpen, setTryYourselfOpen] = useState(false);

  // ── Load offers + detect first deal sent ────────────────────────────────────
  useEffect(() => {
    // Restore a persisted success banner (survives same-session navigations).
    try {
      const raw = localStorage.getItem(SUCCESS_BANNER_KEY);
      if (raw) setFirstDealMeta(JSON.parse(raw) as FirstDealMeta);
    } catch { /* ignore malformed entry */ }

    listOffers(1, 50)
      .then(({ data }) => {
        setOffers(data);

        const hadZero = localStorage.getItem(HAD_ZERO_KEY) === 'true';

        if (data.length === 0) {
          // Record zero state so we can detect the 0→1 transition.
          localStorage.setItem(HAD_ZERO_KEY, 'true');
        } else if (hadZero) {
          // Count just moved from 0 → ≥1: user sent their first deal.
          const latest = data[0];
          const meta: FirstDealMeta = { id: latest.id, title: latest.title, recipientEmail: latest.recipient?.email };
          setFirstDealMeta(meta);
          localStorage.setItem(SUCCESS_BANNER_KEY, JSON.stringify(meta));
          localStorage.removeItem(HAD_ZERO_KEY);
        }
      })
      .catch(() => { /* render empty state gracefully */ })
      .finally(() => setLoading(false));
  }, []);

  // ── Onboarding state ────────────────────────────────────────────────────────
  const { currentStep, showModal, showBanner, dismiss, setStep } =
    useFirstDealOnboarding({ offerCount: offers.length, loading });

  // ── Success banner handlers ─────────────────────────────────────────────────
  const dismissSuccessBanner = useCallback(() => {
    setFirstDealMeta(null);
    localStorage.removeItem(SUCCESS_BANNER_KEY);
  }, []);

  const hasDeals = !loading && offers.length > 0;
  const stats = computeStats(offers);

  return (
    <>
      {/* ── Welcome modal (shown once to first-time users) ───────────────────── */}
      {showModal && (
        <FirstDealOnboarding
          currentStep={currentStep}
          onStepChange={setStep}
          onDismiss={dismiss}
          onTryYourself={() => setTryYourselfOpen(true)}
        />
      )}

      {/* ── "Try it yourself" quick-send modal ──────────────────────────────── */}
      {tryYourselfOpen && (
        <TryYourselfModal onClose={() => setTryYourselfOpen(false)} />
      )}

      <div className="max-w-[1200px] mx-auto flex flex-col gap-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[length:var(--font-size-h1)] font-bold tracking-tight text-(--color-text-primary)">
            Dashboard
          </h1>
          <Link href="/dashboard/deals/new">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              New deal
            </Button>
          </Link>
        </div>

        {/* ── Onboarding nudge banner (compact; after modal is dismissed) ───── */}
        {showBanner && bannerVisible && (
          <OnboardingBanner onDismiss={() => setBannerVisible(false)} />
        )}

        {/* ── First deal success banner ──────────────────────────────────────── */}
        {firstDealMeta && (
          <DealSentSuccessBanner
            dealTitle={firstDealMeta.title}
            dealId={firstDealMeta.id}
            recipientEmail={firstDealMeta.recipientEmail}
            onDismiss={dismissSuccessBanner}
          />
        )}

        {/* ── Micro stats ───────────────────────────────────────────────────── */}
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

        {/* ── Empty state ────────────────────────────────────────────────────── */}
        {!loading && !hasDeals && <FirstDealEmptyState />}

        {/* ── Active dashboard ───────────────────────────────────────────────── */}
        {(loading || hasDeals) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DealStatusList offers={offers} loading={loading} />
            </div>
            <div className="lg:col-span-1">
              <ActivityFeed maxItems={12} />
            </div>
          </div>
        )}

      </div>
    </>
  );
}
