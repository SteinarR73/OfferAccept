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
        className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-6"
        aria-hidden="true"
      >
        <FileText className="w-8 h-8 text-blue-500" />
      </div>

      {/* Heading */}
      <h2 className="text-xl font-semibold text-[--color-text-primary] mb-2">
        No deals yet
      </h2>
      <p className="text-sm text-[--color-text-secondary] max-w-xs mb-8">
        Send your first agreement in under 2 minutes.
      </p>

      {/* Primary CTA */}
      <Link href="/dashboard/deals/new">
        <Button
          variant="primary"
          size="md"
          rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
        >
          Create your first deal
        </Button>
      </Link>

      {/* Soft footnote */}
      <p className="text-xs text-[--color-text-muted] mt-5 max-w-xs">
        You&apos;ll be able to track deal activity and acceptance here.
      </p>

      {/* How it works — 3-step mini guide */}
      <div className="flex items-start gap-6 mt-12 max-w-lg text-left">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-xs font-semibold text-[--color-text-primary]">{s.label}</span>
            </div>
            <p className="text-[11px] text-[--color-text-muted] leading-relaxed">{s.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  { label: 'Add details', detail: 'Name your deal, attach a document, and set the recipient.' },
  { label: 'Send it', detail: 'Your customer receives a secure link — no account needed.' },
  { label: 'Get accepted', detail: 'They confirm via email verification. A tamper-proof certificate is issued.' },
];
