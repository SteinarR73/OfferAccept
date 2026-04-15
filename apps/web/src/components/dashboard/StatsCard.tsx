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
  positive: 'text-[--color-success]',
  negative: 'text-[--color-error]',
  neutral:  'text-[--color-text-muted]',
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
      className="bg-[--color-surface] rounded-xl border border-[--color-border] p-5 flex flex-col gap-1 animate-fade-in shadow-[var(--shadow-card)] card-hover"
      {...(tourId ? { 'data-tour': tourId } : {})}
      aria-label={description ?? `${label}: ${value}`}
    >
      <p className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold tracking-tight text-[--color-text-primary] tabular-nums">{value}</p>
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
      className="bg-[--color-surface] rounded-xl border border-[--color-border] p-5 flex flex-col gap-2 shadow-[var(--shadow-card)]"
      aria-hidden="true"
    >
      <div className="skeleton-shimmer h-3 w-20 rounded" />
      <div className="skeleton-shimmer h-8 w-14 rounded" />
      <div className="skeleton-shimmer h-3 w-24 rounded" />
    </div>
  );
}
