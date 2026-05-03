'use client';

import Link from 'next/link';
import { CheckCircle2, X, ArrowRight, Plus } from 'lucide-react';
import { DealStatusTracker } from './DealStatusTracker';
import type { TrackerStep } from './DealStatusTracker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  dealTitle: string;
  dealId: string;
  recipientEmail?: string;
  onDismiss: () => void;
}

// ─── DealSentSuccessBanner ────────────────────────────────────────────────────
// Shown on the dashboard immediately after the user's first deal is sent.
// Communicates what happens next and shows a 4-step status tracker.

export function DealSentSuccessBanner({ dealTitle, dealId, recipientEmail, onDismiss }: Props) {
  const steps: TrackerStep[] = [
    { label: 'Sent',        status: 'done'    },
    { label: 'Opened',      status: 'active'  },
    { label: 'Accepted',    status: 'pending' },
    { label: 'Certificate', status: 'pending' },
  ];

  const heading = recipientEmail ? `Deal sent to ${recipientEmail}` : 'Deal sent';

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
            {heading}
          </p>
          <p className="text-xs text-(--color-text-secondary) mt-0.5 truncate">
            <span className="font-medium">{dealTitle}</span> is on its way. You&apos;ll be
            notified the moment it&apos;s accepted.
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss success banner"
          className="text-(--color-success)/60 hover:text-(--color-success) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-success) rounded p-0.5 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status tracker */}
      <div className="border-t border-(--color-success-border)/40 px-4 py-3">
        <DealStatusTracker steps={steps} />
        <p className="text-[11px] text-(--color-text-muted) mt-1">
          If not opened within 24 hours, you can send a reminder.
        </p>
      </div>

      {/* Actions */}
      <div className="border-t border-(--color-success-border)/40 px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link
          href={`/dashboard/deals/${dealId}`}
          className="flex items-center gap-1 text-xs font-semibold text-(--color-success) hover:text-(--color-accent-text) transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-success) rounded"
        >
          View deal
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
        <Link
          href={`/dashboard/deals/${dealId}`}
          className="flex items-center gap-1 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
        >
          Send reminder
        </Link>
        <Link
          href="/dashboard/deals/new"
          className="flex items-center gap-1 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
          Send another deal
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded ml-auto"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

// Named alias for spec compatibility
export { DealSentSuccessBanner as DealSentBanner };
