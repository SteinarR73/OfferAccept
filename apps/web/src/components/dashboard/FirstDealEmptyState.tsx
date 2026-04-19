'use client';

import Link from 'next/link';
import { FileText, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';

// ─── FirstDealEmptyState ──────────────────────────────────────────────────────
// Shown on the dashboard when the user has no deals.
// Primary goal: get them to the wizard in one click.

export function FirstDealEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
      {/* Icon */}
      <div
        className="w-16 h-16 rounded-2xl bg-(--color-accent-light) border border-(--color-accent-light) flex items-center justify-center mb-6"
        aria-hidden="true"
      >
        <FileText className="w-8 h-8 text-(--color-accent)" />
      </div>

      {/* Heading */}
      <h2 className="text-xl font-bold tracking-tight text-(--color-text-primary) mb-2">
        You haven&apos;t sent any deals yet.
      </h2>
      <p className="text-sm text-(--color-text-secondary) max-w-sm mb-2 leading-relaxed">
        When you send a deal, you&apos;ll see its status here — opened, accepted, or waiting.
        After acceptance, your certificate is one click away.
      </p>
      <p className="text-xs text-(--color-text-muted) max-w-xs mb-8 leading-relaxed">
        No account required for recipients — they accept via a secure email link.
      </p>

      {/* Primary CTA */}
      <Link href="/dashboard/deals/new?firstDeal=true">
        <Button
          variant="primary"
          size="md"
          rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
        >
          Send your first deal
        </Button>
      </Link>

      {/* Recipient reassurance */}
      <p className="text-xs text-(--color-text-muted) mt-3 max-w-xs">
        What recipients see: a secure webpage with your document and an Accept button.
        Nothing to install. Nothing to sign up for.
      </p>

      {/* How it works — 3-step mini guide */}
      <div className="flex items-start gap-6 mt-12 max-w-lg text-left" aria-label="How it works">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-(--color-accent) text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0" aria-hidden="true">
                {i + 1}
              </span>
              <span className="text-xs font-semibold text-(--color-text-primary)">{s.label}</span>
            </div>
            <p className="text-[11px] text-(--color-text-muted) leading-relaxed">{s.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  {
    label:  'Add details',
    detail: 'Name your deal, attach a document, and enter your recipient\'s email.',
  },
  {
    label:  'Send it',
    detail: 'Your recipient receives a secure link — no account required on their end.',
  },
  {
    label:  'Get proof',
    detail: 'They confirm in under 60 seconds. A tamper-evident certificate is issued instantly.',
  },
];
