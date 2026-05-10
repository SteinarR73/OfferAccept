import type { Metadata } from 'next';
import Link from 'next/link';
import { Shield, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Demo — Certificate Verification · OfferAccept',
  description:
    'See how OfferAccept certificate verification works, using a demonstration acceptance record.',
  robots: 'noindex',
};

// ─── Seeded demo certificate ─────────────────────────────────────────────────

const CERT = {
  id: 'demo_cert_01JXYZ2K9ARST456UV',
  storedHash:
    'a3f1b9c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
  offerTitle: 'Q1 2026 Consulting Proposal',
  recipientEmail: 'you@example.com',
  acceptedAt: 'April 15, 2026 at 09:32 UTC',
};

const CHECKS = [
  {
    label: 'Certificate hash verified',
    detail:
      'The SHA-256 hash of this record matches the stored certificate — it has not been altered.',
    explanation: 'SHA-256 hash',
    why: 'The certificate is sealed with a hash computed from the full acceptance record. Any change — even a single character — produces a completely different hash.',
  },
  {
    label: 'Document integrity confirmed',
    detail: 'The document snapshot hash matches the files at the time of acceptance.',
    explanation: 'Document fingerprint',
    why: 'Each file attached to the document is hashed at the moment of acceptance. If the file changed afterward, the hash would not match.',
  },
  {
    label: 'Email verification recorded',
    detail:
      'A one-time code confirmed the recipient controlled the email address used in this acceptance.',
    explanation: 'OTP verification',
    why: 'Before a recipient can accept, they must prove control of their email address by entering a code sent to that address. This prevents someone else from accepting on their behalf.',
  },
  {
    label: 'Immutable audit trail verified',
    detail: 'The acceptance event chain is intact — the audit log shows no gaps or modifications.',
    explanation: 'Append-only record',
    why: 'Acceptance records are stored in an append-only table. No record can be deleted or modified after it is created.',
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoVerifyPage() {
  return (
    <div className="min-h-screen bg-(--color-bg) flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-(--color-border) bg-white px-6 py-3 flex items-center gap-2.5">
        <Shield className="w-5 h-5 text-(--color-accent)" aria-hidden="true" />
        <span className="font-semibold text-sm text-(--color-text-primary)">OfferAccept</span>
        <span className="text-(--color-border) select-none mx-1">·</span>
        <span className="text-sm text-(--color-text-secondary)">Certificate verification</span>
        <Link
          href="/demo"
          className="ml-auto text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
        >
          ← Back to demo
        </Link>
      </header>

      {/* ── Demo banner ────────────────────────────────────────────────────── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center" role="status">
        <p className="text-xs text-amber-800 font-medium">
          Demonstration environment — showing an example verification result. No real data is stored.
        </p>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-b from-green-50 to-white overflow-hidden shadow-sm">

            {/* Hero */}
            <div className="px-8 pt-10 pb-6 text-center">
              <div
                className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center ring-4 ring-green-200 shadow-lg shadow-green-200/60 mx-auto mb-4"
                aria-hidden="true"
              >
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-green-800 mb-2">Acceptance record verified</h1>
              <p className="text-sm text-green-700 max-w-xs mx-auto">
                This acceptance record has not been altered since it was issued.
              </p>
            </div>

            {/* Validation checks */}
            <div className="mx-6 mb-5 rounded-xl border border-green-200 bg-white/80 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {CHECKS.map((c) => (
                  <div key={c.label} className="flex items-start gap-3 py-3 px-4">
                    <div className="flex-shrink-0 mt-0.5 text-green-500">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{c.label}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-green-100 text-green-700">
                          PASS
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-white/70 rounded-xl border border-green-200 divide-y divide-green-100 mx-6 mb-5">
              {[
                { label: 'Document',    value: CERT.offerTitle },
                { label: 'Accepted by', value: CERT.recipientEmail },
                { label: 'Accepted',    value: CERT.acceptedAt },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-start gap-3 px-4 py-2.5">
                  <span className="text-xs text-green-700 font-semibold uppercase tracking-wider w-24 flex-shrink-0 pt-0.5">
                    {label}
                  </span>
                  <span className="text-sm font-medium text-gray-900 text-right leading-snug">{value}</span>
                </div>
              ))}
            </div>

            {/* What was verified */}
            <div className="mx-6 mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold text-gray-700 mb-3">How each check works</p>
              <ul className="space-y-3">
                {CHECKS.map((c) => (
                  <li key={c.explanation} className="flex gap-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span className="text-xs text-gray-600 leading-relaxed">
                      <strong className="text-gray-800">{c.explanation}</strong> — {c.why}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            <div className="border-t border-green-100 px-6 py-5 text-center">
              <p className="text-xs text-amber-700 font-medium mb-2">
                This is a demonstration — the certificate ID above is not a real record.
              </p>
              <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
                Real acceptance records created with OfferAccept are verified the same way — using
                only the certificate ID and standard cryptographic tools.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
                >
                  Create your own acceptance record →
                </Link>
                <Link
                  href="/verify"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-(--color-border) text-sm text-(--color-text-secondary) hover:bg-gray-50 transition-colors"
                >
                  Verify a real certificate
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-(--color-border) bg-gray-50/60 px-6 py-4 text-center">
        <p className="text-xs text-(--color-text-muted)">
          Certificates are cryptographically sealed and tamper-evident.
        </p>
      </footer>
    </div>
  );
}
