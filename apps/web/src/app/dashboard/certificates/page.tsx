'use client';

import { Award } from 'lucide-react';

// ─── CertificatesPage ─────────────────────────────────────────────────────────
// Placeholder — full implementation coming soon.

export default function CertificatesPage() {
  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[length:var(--font-size-h1)] font-semibold text-(--color-text-primary)">
          Certificates
        </h1>
      </div>

      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div
          className="w-16 h-16 rounded-2xl bg-(--color-accent-light) border border-(--color-accent)/20 flex items-center justify-center mb-6"
          aria-hidden="true"
        >
          <Award className="w-8 h-8 text-(--color-accent)" />
        </div>
        <h2 className="text-xl font-semibold text-(--color-text-primary) mb-2">
          Certificates coming soon
        </h2>
        <p className="text-sm text-(--color-text-secondary) max-w-xs">
          A searchable archive of all acceptance certificates issued on your account will appear here.
        </p>
      </div>
    </div>
  );
}
