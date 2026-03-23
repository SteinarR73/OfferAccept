'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { OfferItem, OfferStatusValue } from '@offeraccept/types';
import { cn } from '@/lib/cn';

// ─── Pipeline stage config ─────────────────────────────────────────────────────

interface Stage {
  key: OfferStatusValue | 'ALL';
  label: string;
  tab: string;          // query param value for filtering on deals page
  color: string;        // bg color when count > 0
  dotColor: string;     // status dot
  textColor: string;
  emptyColor: string;   // bg when count === 0
}

const STAGES: Stage[] = [
  {
    key: 'DRAFT',
    label: 'Draft',
    tab: 'DRAFT',
    color: 'bg-gray-100',
    emptyColor: 'bg-gray-50',
    dotColor: 'bg-gray-400',
    textColor: 'text-gray-700',
  },
  {
    key: 'SENT',
    label: 'Sent',
    tab: 'SENT',
    color: 'bg-blue-50',
    emptyColor: 'bg-gray-50',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-700',
  },
  {
    key: 'ACCEPTED',
    label: 'Accepted',
    tab: 'ACCEPTED',
    color: 'bg-green-50',
    emptyColor: 'bg-gray-50',
    dotColor: 'bg-green-500',
    textColor: 'text-green-700',
  },
  {
    key: 'DECLINED',
    label: 'Declined',
    tab: 'DECLINED',
    color: 'bg-red-50',
    emptyColor: 'bg-gray-50',
    dotColor: 'bg-red-400',
    textColor: 'text-red-600',
  },
  {
    key: 'EXPIRED',
    label: 'Expired',
    tab: 'EXPIRED',
    color: 'bg-amber-50',
    emptyColor: 'bg-gray-50',
    dotColor: 'bg-amber-400',
    textColor: 'text-amber-700',
  },
];

// ─── DealsPipeline ─────────────────────────────────────────────────────────────

interface DealsPipelineProps {
  offers: OfferItem[];
  loading?: boolean;
}

export function DealsPipeline({ offers, loading }: DealsPipelineProps) {
  const counts = useMemo(() => {
    const map: Partial<Record<OfferStatusValue, number>> = {};
    for (const o of offers) {
      map[o.status] = (map[o.status] ?? 0) + 1;
    }
    return map;
  }, [offers]);

  if (loading) return <DealsPipelineSkeleton />;

  // Hide pipeline entirely if no offers yet
  if (offers.length === 0) return null;

  return (
    <section aria-labelledby="pipeline-heading">
      <h2
        id="pipeline-heading"
        className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted] mb-3 px-0.5"
      >
        Deals pipeline
      </h2>

      {/* Connector line */}
      <div className="relative">
        {/* Horizontal rule behind cards — visible only on sm+ */}
        <div
          className="absolute top-1/2 left-0 right-0 h-px bg-gray-200 hidden sm:block"
          aria-hidden="true"
        />

        <ol
          className="relative grid grid-cols-2 gap-2 sm:flex sm:gap-0"
          aria-label="Deal pipeline stages"
        >
          {STAGES.map((stage, i) => {
            const count = counts[stage.key as OfferStatusValue] ?? 0;
            const isLast = i === STAGES.length - 1;

            return (
              <li
                key={stage.key}
                className={cn('sm:flex-1', !isLast && 'sm:pr-2')}
              >
                <Link
                  href={`/dashboard/deals?tab=${stage.tab}`}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-xl border px-3 py-4 text-center',
                    'transition-all duration-150 card-hover focus-visible:ring-2 focus-visible:ring-blue-500',
                    count > 0
                      ? cn('border-transparent', stage.color)
                      : 'border-gray-100 bg-white',
                  )}
                  aria-label={`${stage.label}: ${count} deal${count !== 1 ? 's' : ''}`}
                >
                  {/* Stage dot */}
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full mb-2',
                      count > 0 ? stage.dotColor : 'bg-gray-200',
                    )}
                    aria-hidden="true"
                  />

                  {/* Count */}
                  <span
                    className={cn(
                      'text-2xl font-bold tabular-nums leading-none',
                      count > 0 ? stage.textColor : 'text-gray-300',
                    )}
                  >
                    {count}
                  </span>

                  {/* Label */}
                  <span
                    className={cn(
                      'text-xs font-medium mt-1',
                      count > 0 ? stage.textColor : 'text-gray-400',
                    )}
                  >
                    {stage.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

export function DealsPipelineSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton-shimmer h-3 w-24 rounded mb-3" />
      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="sm:flex-1 rounded-xl border border-gray-100 px-3 py-4 flex flex-col items-center gap-2"
          >
            <div className="skeleton-shimmer w-2 h-2 rounded-full" />
            <div className="skeleton-shimmer h-7 w-6 rounded" />
            <div className="skeleton-shimmer h-2.5 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
