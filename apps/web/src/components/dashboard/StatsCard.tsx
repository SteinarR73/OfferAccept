'use client';

import { cn } from '@/lib/cn';

export interface StatsCardProps {
  label: string;
  value: string | number;
  /** Optional sub-label (e.g. "↑ 12% this week") */
  sub?: string;
  /** 'positive' | 'negative' | 'neutral' colours the sub-label */
  trend?: 'positive' | 'negative' | 'neutral';
  /** data-tour attribute for the onboarding tour */
  tourId?: string;
  /** Accessible description for screen readers */
  description?: string;
}

const trendColour = {
  positive: 'text-green-600',
  negative: 'text-red-500',
  neutral:  'text-gray-500',
};

export function StatsCard({
  label,
  value,
  sub,
  trend = 'neutral',
  tourId,
  description,
}: StatsCardProps) {
  return (
    <article
      className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1 animate-fade-in"
      {...(tourId ? { 'data-tour': tourId } : {})}
      aria-label={description ?? `${label}: ${value}`}
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
      {sub && (
        <p className={cn('text-xs font-medium mt-0.5', trendColour[trend])} aria-hidden="true">
          {sub}
        </p>
      )}
    </article>
  );
}

// ── Skeleton placeholder ────────────────────────────────────────────────────────
export function StatsCardSkeleton() {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-2"
      aria-hidden="true"
    >
      <div className="skeleton h-3 w-20 rounded bg-gray-200" />
      <div className="skeleton h-8 w-14 rounded bg-gray-200" />
      <div className="skeleton h-3 w-24 rounded bg-gray-200" />
    </div>
  );
}
