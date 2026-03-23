'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { OfferItem } from '@offeraccept/types';
import { cn } from '@/lib/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DataPoint {
  label: string;   // short date label e.g. "Jan 3"
  days: number;    // days from creation to acceptance
}

// ─── Derivation ────────────────────────────────────────────────────────────────

function deriveDataPoints(offers: OfferItem[]): DataPoint[] {
  return offers
    .filter((o) => o.status === 'ACCEPTED')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-10)   // last 10 accepted offers
    .map((o) => ({
      label: new Date(o.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      days: Math.max(
        0.1,
        (new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()) / 86_400_000,
      ),
    }));
}

// ─── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ points }: { points: DataPoint[] }) {
  const W = 120;
  const H = 36;
  const PAD = 2;

  const values = points.map((p) => p.days);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = values.map((v, i) => {
    const x = PAD + (i / Math.max(values.length - 1, 1)) * (W - PAD * 2);
    const y = PAD + ((max - v) / range) * (H - PAD * 2);
    return [x, y] as [number, number];
  });

  const pathD = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');

  // Fill path: close down to baseline
  const fillD =
    pathD +
    ` L ${coords[coords.length - 1][0].toFixed(1)} ${H} L ${coords[0][0].toFixed(1)} ${H} Z`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"   />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <path d={fillD} fill="url(#spark-fill)" />
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {coords.length > 0 && (
        <circle
          cx={coords[coords.length - 1][0]}
          cy={coords[coords.length - 1][1]}
          r="2.5"
          fill="#3b82f6"
        />
      )}
    </svg>
  );
}

// ─── Trend computation ─────────────────────────────────────────────────────────

function computeTrend(points: DataPoint[]): 'up' | 'down' | 'flat' {
  if (points.length < 4) return 'flat';
  const half = Math.floor(points.length / 2);
  const first = points.slice(0, half).reduce((s, p) => s + p.days, 0) / half;
  const last  = points.slice(-half).reduce((s, p) => s + p.days, 0) / half;
  const delta = last - first;
  if (delta < -0.3) return 'down'; // getting faster — good
  if (delta >  0.3) return 'up';   // getting slower — concerning
  return 'flat';
}

// ─── AcceptanceTrend ───────────────────────────────────────────────────────────

interface AcceptanceTrendProps {
  offers: OfferItem[];
  loading?: boolean;
}

export function AcceptanceTrend({ offers, loading }: AcceptanceTrendProps) {
  const points = useMemo(() => deriveDataPoints(offers), [offers]);

  if (loading) return <AcceptanceTrendSkeleton />;
  if (points.length < 2) return null;

  const avg = points.reduce((s, p) => s + p.days, 0) / points.length;
  const trend = computeTrend(points);

  const TrendIcon = trend === 'flat' ? Minus : trend === 'down' ? TrendingDown : TrendingUp;
  // "down" = faster (good = green), "up" = slower (bad = amber)
  const trendMeta = {
    down: { color: 'text-green-600', label: 'Getting faster' },
    up:   { color: 'text-amber-600', label: 'Getting slower' },
    flat: { color: 'text-gray-400',  label: 'Stable'         },
  }[trend];

  return (
    <article
      className="bg-white rounded-xl border border-gray-200 p-4 animate-fade-in card-hover"
      aria-label={`Acceptance trend: average ${avg.toFixed(1)} days`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted]">
            Avg acceptance time
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
            {avg.toFixed(1)}
            <span className="text-sm font-normal text-[--color-text-muted] ml-1">days</span>
          </p>
          <div className={cn('flex items-center gap-1 mt-1 text-xs font-medium', trendMeta.color)}>
            <TrendIcon className="w-3 h-3" aria-hidden="true" />
            {trendMeta.label}
          </div>
        </div>

        <div className="flex-shrink-0 mt-1">
          <Sparkline points={points} />
        </div>
      </div>

      <p className="text-xs text-[--color-text-muted] mt-2.5">
        Based on {points.length} accepted offer{points.length !== 1 ? 's' : ''}
      </p>
    </article>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

export function AcceptanceTrendSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" aria-hidden="true">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <div className="skeleton-shimmer h-2.5 w-32 rounded" />
          <div className="skeleton-shimmer h-7 w-16 rounded" />
          <div className="skeleton-shimmer h-2.5 w-20 rounded" />
        </div>
        <div className="skeleton-shimmer w-[120px] h-9 rounded" />
      </div>
    </div>
  );
}
