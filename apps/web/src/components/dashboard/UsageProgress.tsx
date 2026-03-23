'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import {
  getBillingSubscription,
  PLAN_LIMITS,
  type BillingSubscription,
} from '@/lib/offers-api';
import { cn } from '@/lib/cn';

// ─── UsageProgress ─────────────────────────────────────────────────────────────

export function UsageProgress() {
  const [sub, setSub] = useState<BillingSubscription | null>(null);

  useEffect(() => {
    getBillingSubscription()
      .then(setSub)
      .catch(() => { /* billing optional — degrade gracefully */ });
  }, []);

  // Not loaded yet or failed — render nothing (not a critical component)
  if (!sub) return null;

  const limit = PLAN_LIMITS[sub.plan];

  // Unlimited plan — no usage bar needed
  if (limit === null) return null;

  const used   = sub.monthlyOfferCount;
  const pct    = Math.min(Math.round((used / limit) * 100), 100);
  const isHigh = pct >= 80;
  const isFull = pct >= 100;

  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 animate-fade-in',
        isFull  ? 'border-red-200   bg-red-50/70'  :
        isHigh  ? 'border-amber-200 bg-amber-50/70' :
                  'border-gray-200  bg-white',
      )}
      role="region"
      aria-label={`Plan usage: ${used} of ${limit} offers used`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-semibold text-gray-700">
          {used} <span className="font-normal text-[--color-text-muted]">of {limit} offers used</span>
        </p>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            isFull ? 'text-red-600' : isHigh ? 'text-amber-600' : 'text-[--color-text-muted]',
          )}
        >
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full animate-progress-bar transition-all duration-700',
            isFull ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-[--color-accent]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Upgrade nudge */}
      {isHigh && (
        <div className="flex items-center justify-between mt-2.5 gap-2">
          <p className={cn('text-xs', isFull ? 'text-red-600 font-medium' : 'text-amber-700')}>
            {isFull
              ? 'Offer limit reached — upgrade to send more.'
              : 'Almost at your limit. Upgrade to avoid interruptions.'}
          </p>
          <Link
            href="/dashboard/billing"
            className={cn(
              'flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg btn-lift',
              'bg-[--color-accent] text-white hover:bg-[--color-accent-hover] transition-colors',
              'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
            )}
          >
            <Zap className="w-3 h-3" aria-hidden="true" />
            Upgrade
          </Link>
        </div>
      )}
    </div>
  );
}
