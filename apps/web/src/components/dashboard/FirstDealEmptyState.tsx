'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, ArrowRight, FlaskConical } from 'lucide-react';
import { Button } from '../ui/Button';
import { TryYourselfModal } from './TryYourselfModal';

// ─── FirstDealEmptyState ──────────────────────────────────────────────────────
// Shown on the dashboard when the user has no deals.
// Primary: send a real deal via wizard.
// Secondary: "Try it yourself" — sends a test deal to the user's own email
// so they experience the full recipient flow before sending to a customer.

export function FirstDealEmptyState() {
  const [tryModalOpen, setTryModalOpen] = useState(false);

  return (
    <>
      {tryModalOpen && <TryYourselfModal onClose={() => setTryModalOpen(false)} />}

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
        <p className="text-sm text-(--color-text-secondary) max-w-sm mb-8 leading-relaxed">
          Send a deal to a real recipient, or try the full flow yourself first —
          no document needed, takes under 60 seconds.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link href="/dashboard/deals/new?firstDeal=true">
            <Button
              variant="primary"
              size="md"
              rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
            >
              Send your first deal
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="md"
            onClick={() => setTryModalOpen(true)}
            leftIcon={<FlaskConical className="w-4 h-4" aria-hidden="true" />}
          >
            Try it yourself
          </Button>
        </div>

        {/* Recipient reassurance */}
        <p className="text-xs text-(--color-text-muted) mt-4 max-w-xs">
          Recipients need no account — they accept via a secure email link.
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
    </>
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
