'use client';

import Link from 'next/link';
import { X, ArrowRight, Sparkles } from 'lucide-react';

interface Props {
  onDismiss: () => void;
}

// ─── OnboardingBanner ─────────────────────────────────────────────────────────
// Compact nudge shown on the dashboard after the user dismisses the welcome
// modal but hasn't sent a deal yet. Disappears for the current page-load when
// dismissed (use session logic if stickier behavior is needed).

export function OnboardingBanner({ onDismiss }: Props) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-(--color-accent-light) border border-(--color-accent)/20 animate-fade-in"
      role="status"
      aria-label="Onboarding nudge"
    >
      <Sparkles className="w-4 h-4 text-(--color-accent) flex-shrink-0" aria-hidden="true" />

      <p className="flex-1 text-sm text-(--color-accent-text) min-w-0 leading-snug">
        <span className="font-semibold">Get started —</span>{' '}
        send your first deal and see how acceptance tracking works.
      </p>

      <Link
        href="/dashboard/deals/new?firstDeal=true"
        className="flex items-center gap-1 text-xs font-semibold text-(--color-accent) hover:text-(--color-accent-hover) transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
      >
        Send first deal
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>

      <button
        onClick={onDismiss}
        aria-label="Dismiss onboarding banner"
        className="p-0.5 flex-shrink-0 text-(--color-accent)/60 hover:text-(--color-accent) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
