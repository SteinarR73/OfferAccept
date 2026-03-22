'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import {
  getBillingSubscription,
  PLAN_LIMITS,
  type BillingSubscription,
  type SubscriptionPlan,
} from '@/lib/offers-api';

// ─── Plan colours ──────────────────────────────────────────────────────────────

const PLAN_META: Record<SubscriptionPlan, { label: string; badgeClass: string; barClass: string }> = {
  FREE:         { label: 'Free',         badgeClass: 'bg-gray-100 text-gray-700',   barClass: 'bg-gray-400' },
  STARTER:      { label: 'Starter',      badgeClass: 'bg-blue-100 text-blue-700',   barClass: 'bg-blue-500' },
  PROFESSIONAL: { label: 'Professional', badgeClass: 'bg-violet-100 text-violet-700', barClass: 'bg-violet-500' },
  ENTERPRISE:   { label: 'Enterprise',   badgeClass: 'bg-amber-100 text-amber-700', barClass: 'bg-amber-500' },
};

const STATUS_CLASS: Record<string, string> = {
  TRIALING: 'text-blue-600',
  ACTIVE:   'text-green-600',
  PAST_DUE: 'text-red-500',
  CANCELED: 'text-gray-400',
};

// ─── BillingCard ───────────────────────────────────────────────────────────────

interface Props {
  tourId?: string;
}

export function BillingCard({ tourId }: Props) {
  const [sub, setSub] = useState<BillingSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getBillingSubscription()
      .then(setSub)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section
      className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4"
      aria-labelledby="billing-heading"
      {...(tourId ? { 'data-tour': tourId } : {})}
    >
      <div className="flex items-center justify-between">
        <h2 id="billing-heading" className="text-base font-semibold text-gray-900">
          Plan &amp; Usage
        </h2>
        {sub && (
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-semibold',
              PLAN_META[sub.plan].badgeClass,
            )}
          >
            {PLAN_META[sub.plan].label}
          </span>
        )}
      </div>

      {loading && <BillingCardSkeleton />}

      {!loading && error && (
        <div className="text-sm text-gray-400 py-4 text-center">
          <p>Could not load billing info.</p>
          <Link
            href="/dashboard/settings/billing"
            className="mt-1 text-blue-600 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            View billing settings →
          </Link>
        </div>
      )}

      {!loading && sub && (
        <>
          {/* Status */}
          <p className={cn('text-xs font-medium', STATUS_CLASS[sub.status] ?? 'text-gray-500')}>
            {sub.status.replace('_', ' ')}
          </p>

          {/* Usage bar */}
          <UsageBar plan={sub.plan} count={sub.monthlyOfferCount} barClass={PLAN_META[sub.plan].barClass} />

          {/* Period info */}
          {sub.currentPeriodEnd && (
            <p className="text-xs text-gray-400">
              Resets{' '}
              <time dateTime={sub.currentPeriodEnd}>
                {formatResetDate(sub.currentPeriodEnd)}
              </time>
            </p>
          )}

          {/* CTA */}
          {(sub.plan === 'FREE' || sub.plan === 'STARTER') && (
            <Link
              href="/dashboard/settings/billing"
              className={cn(
                'mt-1 w-full text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-blue-600 text-white hover:bg-blue-700',
                'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
              )}
            >
              Upgrade plan →
            </Link>
          )}

          {sub.cancelAtPeriodEnd && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Cancels at end of period. Renew in billing settings.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ── UsageBar ───────────────────────────────────────────────────────────────────

function UsageBar({
  plan,
  count,
  barClass,
}: {
  plan: SubscriptionPlan;
  count: number;
  barClass: string;
}) {
  const limit = PLAN_LIMITS[plan];

  if (limit === null) {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Offers this month</p>
        <p className="text-2xl font-bold text-gray-900">{count}</p>
        <p className="text-xs text-gray-400 mt-0.5">Unlimited</p>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((count / limit) * 100));
  const overLimit = count >= limit;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs text-gray-500">Offers this month</p>
        <p className="text-xs font-semibold text-gray-700 tabular-nums">
          {count} / {limit}
        </p>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${count} of ${limit} offers used this month`}
        className="h-2 bg-gray-100 rounded-full overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full animate-progress-bar transition-all',
            overLimit ? 'bg-red-500' : barClass,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {overLimit && (
        <p className="text-xs text-red-500 mt-1 font-medium">
          Limit reached — upgrade to send more
        </p>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatResetDate(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'soon';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
}

function BillingCardSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-hidden="true">
      <div className="skeleton h-3 w-16 rounded bg-gray-200" />
      <div>
        <div className="flex justify-between mb-1.5">
          <div className="skeleton h-3 w-24 rounded bg-gray-200" />
          <div className="skeleton h-3 w-12 rounded bg-gray-200" />
        </div>
        <div className="skeleton h-2 w-full rounded-full bg-gray-200" />
      </div>
      <div className="skeleton h-3 w-32 rounded bg-gray-200" />
    </div>
  );
}
