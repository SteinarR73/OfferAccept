'use client';

import { HelpCircle } from 'lucide-react';

// ─── SupportPage ─────────────────────────────────────────────────────────────
// Placeholder — full support resources coming soon.

export default function SupportPage() {
  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--font-size-h1)] font-semibold text-[--color-text-primary]">
          Support
        </h1>
      </div>

      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div
          className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-6"
          aria-hidden="true"
        >
          <HelpCircle className="w-8 h-8 text-blue-500" />
        </div>
        <h2 className="text-xl font-semibold text-[--color-text-primary] mb-2">
          Need help?
        </h2>
        <p className="text-sm text-[--color-text-secondary] max-w-xs mb-6">
          Contact our support team or browse the documentation.
        </p>
        <a
          href="mailto:support@offeraccept.com"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[--color-accent] text-white text-sm font-medium hover:bg-[--color-accent-hover] transition-colors"
        >
          Email support
        </a>
      </div>
    </div>
  );
}
