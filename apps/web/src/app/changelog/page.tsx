import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog — OfferAccept',
  description: 'Product updates and release notes for OfferAccept.',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ChangeKind = 'New' | 'Improved' | 'Fixed' | 'Security' | 'Removed';

interface Change {
  kind: ChangeKind;
  text: string;
}

interface Release {
  version: string;
  date: string;
  summary: string;
  changes: Change[];
}

// ─── Release data ─────────────────────────────────────────────────────────────
// Newest first.

const RELEASES: Release[] = [
  {
    version: '1.1.0',
    date: '2026-05-10',
    summary: 'UX clarity pass, pre-launch hardening, and first-deal onboarding.',
    changes: [
      { kind: 'New', text: 'First-deal onboarding modal: a 3-step walkthrough shown to new users that explains the sending flow, recipient experience, and certificate.' },
      { kind: 'New', text: '"Try it yourself" feature: senders can send a test deal to their own inbox to experience the recipient flow before going live.' },
      { kind: 'New', text: 'Offline PDF certificate verification: the certificate PDF now contains everything needed to verify acceptance without an internet connection or OfferAccept service.' },
      { kind: 'New', text: 'PMF instrumentation: recipient funnel metrics (OTP requests, verifications, declines, demo completions, second-send rate) added to the Prometheus metrics endpoint.' },
      { kind: 'New', text: 'Acceptance context banner on the signing page clearly communicates what the recipient is accepting, who sent it, and what the one-time code confirms.' },
      { kind: 'Improved', text: 'Signing flow: step labels, button copy, and error messages rewritten for clarity.' },
      { kind: 'Improved', text: 'Certificate PDF: evidence text section expanded to explain each field and its legal significance.' },
      { kind: 'Improved', text: 'Dashboard empty state: clearer CTA hierarchy with a "send your first document" primary path.' },
      { kind: 'Security', text: 'Content Security Policy nonces added to inline scripts and styles to prevent XSS injection.' },
      { kind: 'Security', text: 'Account lockout: failed OTP verification now triggers exponential back-off and a temporary lock after repeated failures.' },
      { kind: 'Security', text: 'Metrics endpoint gated behind a bearer token — no longer publicly accessible.' },
      { kind: 'Security', text: 'Legal pages (Terms, DPA) enforced on dashboard access; users without accepted terms are redirected.' },
      { kind: 'Fixed', text: 'Tailwind v4 CSS variable syntax corrected across all components (parentheses instead of brackets).' },
      { kind: 'Fixed', text: 'TypeScript strict-mode errors in onboarding components resolved.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-22',
    summary: 'Initial public launch.',
    changes: [
      { kind: 'New', text: 'Core acceptance flow: send a document link, collect email-verified acceptance, receive a tamper-evident certificate.' },
      { kind: 'New', text: 'SHA-256 hash chain: every document snapshot and acceptance event is hashed and chained for offline verifiability.' },
      { kind: 'New', text: 'Acceptance certificate PDF with machine-readable QR verification.' },
      { kind: 'New', text: 'One-time code (OTP) recipient identity verification via email.' },
      { kind: 'New', text: 'Dashboard: deal list, detail view, activity log, document download.' },
      { kind: 'New', text: 'Recipient decline flow with audit record.' },
      { kind: 'New', text: 'Offer expiry: links auto-expire after 30 days.' },
      { kind: 'New', text: 'Certificate public verification page at /verify/:id.' },
      { kind: 'New', text: 'Free tier: 3 documents per month, no credit card required.' },
      { kind: 'New', text: 'Stripe-powered billing with monthly subscription plans.' },
      { kind: 'New', text: 'Multi-organisation support with Owner, Admin, Member, and Viewer roles.' },
      { kind: 'New', text: 'API key authentication for headless integrations.' },
      { kind: 'New', text: 'Webhook delivery for offer.accepted and certificate.issued events, HMAC-SHA256 signed.' },
      { kind: 'New', text: 'Prometheus metrics endpoint: job duration, AI latency, queue depth, deal lifecycle, certificate counters.' },
      { kind: 'New', text: 'GDPR: data subject rights (access, deletion, portability) handled via privacy@offeraccept.com.' },
      { kind: 'New', text: 'Sub-processor list, DPA, Cookie Policy, Acceptable Use Policy, and full Terms of Service published at launch.' },
    ],
  },
];

// ─── Badge component ──────────────────────────────────────────────────────────

const KIND_STYLES: Record<ChangeKind, string> = {
  New: 'bg-blue-50 text-blue-700 border-blue-200',
  Improved: 'bg-green-50 text-green-700 border-green-200',
  Fixed: 'bg-amber-50 text-amber-700 border-amber-200',
  Security: 'bg-red-50 text-red-700 border-red-200',
  Removed: 'bg-gray-100 text-gray-600 border-gray-200',
};

function KindBadge({ kind }: { kind: ChangeKind }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${KIND_STYLES[kind]}`}
    >
      {kind}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <span className="w-7 h-7 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold">
              OA
            </span>
            OfferAccept
          </Link>
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Changelog</h1>
          <p className="text-sm text-gray-500">
            A running record of product updates. Newest first.
          </p>
        </div>

        <div className="space-y-14">
          {RELEASES.map((release) => (
            <article key={release.version}>
              {/* Release header */}
              <div className="flex items-baseline gap-3 mb-1">
                <h2 className="text-lg font-bold text-gray-900">v{release.version}</h2>
                <time
                  dateTime={release.date}
                  className="text-sm text-gray-500 tabular-nums"
                >
                  {new Date(release.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              </div>
              <p className="text-sm text-gray-600 mb-5">{release.summary}</p>

              {/* Change list */}
              <ul className="space-y-3">
                {release.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <KindBadge kind={change.kind} />
                    <span className="text-sm text-gray-700 leading-snug">{change.text}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
