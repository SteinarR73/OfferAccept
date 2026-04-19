'use client';

import Link from 'next/link';
import { CheckCircle2, X, ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dealTitle: string;
  dealId: string;
  onDismiss: () => void;
}

type StepStatus = 'done' | 'active' | 'pending';

interface TrackerStep {
  label: string;
  status: StepStatus;
}

// ─── DealSentSuccessBanner ────────────────────────────────────────────────────
// Shown on the dashboard immediately after the user's first deal is sent.
// Communicates what happens next and shows a 4-step status tracker.

export function DealSentSuccessBanner({ dealTitle, dealId, onDismiss }: Props) {
  const steps: TrackerStep[] = [
    { label: 'Sent',        status: 'done'    },
    { label: 'Opened',      status: 'active'  },
    { label: 'Accepted',    status: 'pending' },
    { label: 'Certificate', status: 'pending' },
  ];

  return (
    <div
      className="rounded-xl border border-(--color-success-border) bg-(--color-success-light) overflow-hidden animate-fade-in"
      role="status"
      aria-label="First deal sent"
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        <CheckCircle2
          className="w-5 h-5 text-(--color-success) flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-(--color-success) leading-snug">
            Deal sent
          </p>
          <p className="text-xs text-(--color-text-secondary) mt-0.5 truncate">
            <span className="font-medium">{dealTitle}</span> is on its way. You&apos;ll be
            notified the moment it&apos;s accepted.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            href={`/dashboard/deals/${dealId}`}
            className="flex items-center gap-1 text-xs font-semibold text-(--color-success) hover:text-(--color-accent-text) transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-success) rounded"
          >
            View deal
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>

          <button
            onClick={onDismiss}
            aria-label="Dismiss success banner"
            className="text-(--color-success)/60 hover:text-(--color-success) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-success) rounded p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status tracker */}
      <div className="border-t border-(--color-success-border)/40 px-4 py-3">
        <div className="flex items-center">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                {/* Circle indicator */}
                <div
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                    s.status === 'done'
                      ? 'bg-(--color-success)'
                      : s.status === 'active'
                      ? 'bg-(--color-surface) border-2 border-(--color-success)'
                      : 'bg-(--color-surface) border-2 border-(--color-border)',
                  )}
                  aria-hidden="true"
                >
                  {s.status === 'done' && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                  {s.status === 'active' && (
                    <span className="w-2 h-2 rounded-full bg-(--color-success) animate-pulse" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-[10px] font-medium whitespace-nowrap',
                    s.status === 'done'
                      ? 'text-(--color-success)'
                      : s.status === 'active'
                      ? 'text-(--color-text-primary)'
                      : 'text-(--color-text-muted)',
                  )}
                >
                  {s.label}
                </span>
              </div>

              {/* Connector line — not rendered after last step */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-1 mb-4',
                    s.status === 'done' ? 'bg-(--color-success)' : 'bg-(--color-border)',
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] text-(--color-text-muted) mt-1">
          Most recipients open the link within the hour. Send a reminder any time from the deal page.
        </p>
      </div>
    </div>
  );
}
