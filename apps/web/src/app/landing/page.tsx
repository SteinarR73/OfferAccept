import Link from 'next/link';
import type { Metadata } from 'next';
import { OfferAcceptLogo } from '@/components/brand/OfferAcceptLogo';
import { LandingPricingClient } from './LandingPricingClient';

export const metadata: Metadata = {
  title: 'OfferAccept — Verifiable proof of acceptance',
  description:
    'OfferAccept proves a specific person accepted a specific document at a specific time — timestamped, email-verified, and independently verifiable.',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-(--color-surface) text-(--color-text-primary)">
      <LandingNav />
      <main>
        <Hero />
        <TrustStrip />
        <NotEsignature />
        <BeforeAfter />
        <HowItWorks />
        <HowVerificationWorks />
        <CertificateProof />
        <WhoItsFor />
        <DemoSection />
        <Pricing />
        <Faq />
        <FinalCta />
        <LegalClarification />
      </main>
      <LandingFooter />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <header className="sticky top-0 z-30 bg-(--color-surface)/90 backdrop-blur border-b border-(--color-border-subtle)">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="rounded focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          <OfferAcceptLogo size="sm" priority />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded px-1"
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className="text-sm font-medium text-white bg-(--color-accent) hover:bg-(--color-accent-hover) transition-colors px-3 py-1.5 rounded-lg focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
          >
            View live demo →
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-(--color-text-primary) leading-tight mb-5">
        When someone says &ldquo;I agree&rdquo; by email,
        <br className="hidden sm:block" />
        <span className="text-(--color-accent)"> you have nothing.</span>
      </h1>

      <p className="text-lg text-(--color-text-muted) max-w-2xl mx-auto mb-8 leading-relaxed">
        OfferAccept gives you proof — a timestamped, email-verified acceptance
        tied to the exact document they agreed to.
      </p>

      <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-medium hover:bg-(--color-accent-hover) transition-colors shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          View live demo
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center gap-1 px-5 py-2.5 rounded-lg border border-(--color-border) text-sm font-medium text-(--color-text-secondary) hover:bg-(--color-bg) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          See how it works
        </a>
      </div>

      <p className="text-xs text-(--color-text-muted) mb-8">
        No account required to view the demo.{' '}
        <Link
          href="/login?mode=signup"
          className="text-(--color-accent) font-medium hover:underline"
        >
          Create free account →
        </Link>
      </p>

      {/* Trust microcopy */}
      <div className="flex items-center justify-center gap-5 flex-wrap text-xs text-(--color-text-muted)">
        {[
          'No account needed for your recipient',
          'Recipients complete in under a minute',
          'Independent verification included',
        ].map((item) => (
          <span key={item} className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-(--color-accent)"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </span>
        ))}
      </div>

      {/* Browser-mockup illustration */}
      <div
        className="mt-14 max-w-2xl mx-auto rounded-xl border border-(--color-border) shadow-md overflow-hidden"
        aria-hidden="true"
      >
        <div className="bg-(--color-neutral-surface) flex items-center gap-1.5 px-4 py-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="flex-1 ml-2 h-5 bg-(--color-surface) rounded text-[10px] text-(--color-text-muted) flex items-center px-3">
            offeraccept.com/accept/oa_abc123…
          </span>
        </div>
        <div className="bg-(--color-surface) px-6 py-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              OA
            </div>
            <div>
              <p className="text-xs font-semibold text-(--color-text-primary)">Acme Corp has sent you a document</p>
              <p className="text-xs text-(--color-text-muted) mt-0.5">Senior Engineer — Q1 2026</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            {['Proposal summary.pdf', 'Compensation summary.pdf'].map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--color-bg) border border-(--color-border-subtle)"
              >
                <span className="w-6 h-6 rounded bg-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">
                  PDF
                </span>
                <span className="text-xs text-(--color-text-secondary)">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-9 rounded-lg bg-(--color-accent) flex items-center justify-center text-xs text-white font-medium">
              Review &amp; accept
            </div>
            <div className="flex-1 h-9 rounded-lg border border-(--color-border) flex items-center justify-center text-xs text-(--color-text-muted)">
              Decline
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ──────────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  { label: 'OTP-verified identity', desc: 'Recipient email confirmed before acceptance' },
  { label: 'Tamper-evident certificates', desc: 'SHA-256 hash chain' },
  { label: 'Third-party verifiable', desc: 'Anyone can verify — no account needed' },
  { label: 'Time-limited links', desc: 'Acceptance links expire automatically' },
];

function TrustStrip() {
  return (
    <section aria-label="Trust indicators" className="border-y border-(--color-border-subtle) bg-(--color-bg)">
      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TRUST_ITEMS.map((t) => (
          <div key={t.label} className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-(--color-accent) flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-(--color-text-primary)">{t.label}</p>
              <p className="text-[11px] text-(--color-text-muted)">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Not e-signature ──────────────────────────────────────────────────────────

function NotEsignature() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-6">
        This is not e-signature software
      </h2>
      <p className="text-base text-(--color-text-muted) mb-5 leading-relaxed">
        OfferAccept does one thing:
      </p>
      <p className="text-lg font-medium text-(--color-text-primary) mb-8 max-w-xl mx-auto leading-relaxed">
        It proves that a specific person, using a specific email address, accepted a
        specific document — at a specific time.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
        {[
          'Not a contract platform',
          'Not a qualified electronic signature',
          'Not legal automation',
        ].map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 rounded-full border border-(--color-border) bg-(--color-bg) px-3.5 py-1.5 text-sm text-(--color-text-secondary)"
          >
            <svg
              className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {item}
          </span>
        ))}
      </div>
      <p className="text-sm font-medium text-(--color-text-secondary) border-l-4 border-(--color-accent) pl-4 text-left max-w-lg mx-auto leading-relaxed">
        It&rsquo;s proof of acceptance — built for situations where email isn&rsquo;t enough.
      </p>
    </section>
  );
}

// ─── Before / After ───────────────────────────────────────────────────────────

function BeforeAfter() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">What actually changes</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-red-500 mb-4">Before: email acceptance</p>
            <ul className="space-y-3">
              {[
                'Client replies "looks good"',
                'Email thread gets forwarded, edited, or lost',
                'No proof of what version they saw',
                'Disputes become your problem',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-red-700">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-4">After: OfferAccept</p>
            <ul className="space-y-3">
              {[
                'You send one link',
                'They verify their email with a one-time code',
                'They click Accept',
                'You get a certificate with timestamp, verified email, document hash, and audit trail',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-emerald-700">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-8 text-center text-sm font-medium text-(--color-text-secondary) max-w-lg mx-auto leading-relaxed">
          If someone later says &ldquo;that&rsquo;s not what I agreed to&rdquo; — you have proof.
        </p>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const HOW_STEPS = [
  { n: '1', title: 'Send', desc: 'Upload your document and send a secure link to your recipient.' },
  { n: '2', title: 'Confirm', desc: 'Your recipient verifies their email with a one-time code, then clicks Accept.' },
  { n: '3', title: 'Get proof', desc: 'A certificate is generated automatically — downloadable and verifiable by anyone.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">How it works</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        {HOW_STEPS.map((step) => (
          <div key={step.n} className="flex flex-col items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-(--color-accent) flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {step.n}
            </div>
            <h3 className="font-semibold text-(--color-text-primary)">{step.title}</h3>
            <p className="text-sm text-(--color-text-muted) leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-(--color-text-muted)">
        No login. No app. No friction for your recipient.
      </p>
    </section>
  );
}

// ─── How verification works ───────────────────────────────────────────────────

const VERIFICATION_STEPS = [
  {
    n: '1',
    title: 'Email is verified before acceptance',
    desc: 'The recipient proves they control the email address by entering a one-time code sent to that inbox. No code, no acceptance.',
  },
  {
    n: '2',
    title: 'The document is fingerprinted',
    desc: 'The accepted document and the full acceptance record are fingerprinted using SHA-256 — a standard cryptographic function used across banking, software, and legal systems.',
  },
  {
    n: '3',
    title: 'An immutable certificate is issued',
    desc: 'A tamper-evident certificate is created automatically. The certificate and the underlying record are append-only — they cannot be changed after issuance.',
  },
  {
    n: '4',
    title: 'Anyone can verify — independently',
    desc: 'The certificate can be verified by any third party using only the certificate ID and standard tools. No OfferAccept account required.',
  },
];

function HowVerificationWorks() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-3">
            How the proof is built
          </h2>
          <p className="text-base text-(--color-text-muted) max-w-xl mx-auto">
            The certificate is not a signature — it&rsquo;s a verifiable chain of evidence. Here&rsquo;s what each step records.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {VERIFICATION_STEPS.map((step) => (
            <div
              key={step.n}
              className="rounded-xl border border-(--color-border) bg-(--color-surface) p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-(--color-accent)/10 flex items-center justify-center text-sm font-bold text-(--color-accent) flex-shrink-0">
                  {step.n}
                </div>
                <h3 className="text-sm font-semibold text-(--color-text-primary)">{step.title}</h3>
              </div>
              <p className="text-sm text-(--color-text-muted) leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm font-medium text-(--color-text-secondary) max-w-lg mx-auto leading-relaxed">
          The math proves it. You don&rsquo;t need to trust OfferAccept — the hash can be recomputed independently.
        </p>
      </div>
    </section>
  );
}

// ─── Certificate proof ─────────────────────────────────────────────────────────
// Merges CertificateSection + IndependentVerification + "What it proves/doesn't prove"

const CERT_PROVES = [
  'Which document was accepted — exact version, SHA-256 hashed',
  'Which email address confirmed it — verified by one-time code',
  'When acceptance happened — to-the-second UTC timestamp',
  'That the record was not modified afterward — immutable audit trail',
];

const CERT_NOT_PROVES = [
  'Identity verification beyond email control',
  'Legal enforceability in every jurisdiction',
  'Qualified electronic signature status under eIDAS',
];

function CertificateProof() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-3">
          What the certificate proves
        </h2>
        <p className="text-base text-(--color-text-muted) max-w-xl mx-auto">
          Honest about what it can and cannot establish.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
        {/* What it proves */}
        <div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-4">What it proves</p>
            <ul className="space-y-3">
              {CERT_PROVES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-emerald-700">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* What it doesn't prove + certificate mock */}
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-4">What it does not prove</p>
            <ul className="space-y-3">
              {CERT_NOT_PROVES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-4 leading-relaxed">
              Being clear about limitations is part of what makes the evidence credible.
            </p>
          </div>

          {/* Certificate mock */}
          <div className="rounded-xl border border-(--color-border) bg-(--color-surface) shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-(--color-border-subtle) bg-(--color-success-light)">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-(--color-success) flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-(--color-success-text)">Acceptance Certificate</span>
              </div>
              <span className="text-[10px] text-(--color-text-muted)">OfferAccept</span>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {[
                { label: 'Document', value: 'Senior Engineer — Q1 2026' },
                { label: 'Accepted', value: 'March 22, 2026 at 14:32 UTC' },
                { label: 'By', value: '████████@company.com' },
                { label: 'Method', value: 'OTP-verified email' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4">
                  <span className="text-xs text-(--color-text-muted) w-20 flex-shrink-0 pt-0.5">{label}</span>
                  <span className="text-xs text-(--color-text-primary) font-medium">{value}</span>
                </div>
              ))}
              <div className="border-t border-(--color-border-subtle) pt-2.5 space-y-2">
                {[
                  { label: 'Certificate ID', value: 'cert_01HX2K9A…' },
                  { label: 'SHA-256', value: 'a3f1b9c2d4e5f6a7…' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-4">
                    <span className="text-xs text-(--color-text-muted) w-20 flex-shrink-0 pt-0.5">{label}</span>
                    <code className="text-[11px] text-(--color-text-secondary) font-mono">{value}</code>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-2.5 border-t border-(--color-border-subtle) bg-(--color-bg)">
              <Link
                href="/verify"
                className="text-xs text-(--color-accent) font-medium hover:text-(--color-accent-hover) transition-colors"
              >
                Verify a certificate →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Independent verification callout */}
      <div className="max-w-2xl mx-auto rounded-xl border border-(--color-border) bg-(--color-bg) p-6 text-center">
        <p className="text-sm font-semibold text-(--color-text-primary) mb-2">
          Independently verifiable — online or offline
        </p>
        <p className="text-sm text-(--color-text-muted) leading-relaxed">
          Each certificate includes a SHA-256 hash and the full acceptance record embedded as JSON
          inside the PDF. Anyone can recompute the hash and verify integrity without contacting
          OfferAccept.
        </p>
      </div>
    </section>
  );
}

// ─── Who it's for ─────────────────────────────────────────────────────────────

const GOOD_FIT = [
  'Proposals, quotes, and scopes of work',
  'Client approvals and document acknowledgements',
  'Offer letters where acceptance evidence is enough',
  'Policy acknowledgements and internal approvals',
];

const NOT_FIT = [
  'Regulated contracts requiring formal signatures',
  'Enterprise procurement requiring approved e-signature vendors',
  'Situations requiring qualified e-signatures',
  'Legal automation or contract lifecycle management',
];

function WhoItsFor() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">Who OfferAccept is for</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-8">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-4">Good fit</p>
            <ul className="space-y-3">
              {GOOD_FIT.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-emerald-700">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-4">Not a fit</p>
            <ul className="space-y-3">
              {NOT_FIT.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Recipient friction — merged */}
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-base font-semibold text-(--color-text-primary) mb-3">
            Your recipient doesn&rsquo;t need an account
          </p>
          <p className="text-sm text-(--color-text-muted) mb-4">
            They open a link, verify their email with a one-time code, and click Accept. That&rsquo;s it.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {['No account', 'No app', 'No download', 'Most flows complete in under a minute'].map((item) => (
              <span
                key={item}
                className="rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-2 text-sm text-(--color-text-secondary) font-medium"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Demo section ─────────────────────────────────────────────────────────────

function DemoSection() {
  return (
    <section className="max-w-4xl mx-auto px-6 py-20 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-4">
        See the acceptance flow before you commit
      </h2>
      <p className="text-base text-(--color-text-muted) mb-3 max-w-xl mx-auto leading-relaxed">
        The live demo walks through the exact experience your recipients see — email verification,
        acceptance statement, and certificate — with no account required.
      </p>
      <p className="text-sm text-(--color-text-secondary) mb-8 max-w-lg mx-auto">
        Recipients complete the acceptance flow in under 60 seconds. Try it to see why.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-(--color-accent) text-white font-semibold text-sm hover:bg-(--color-accent-hover) transition-colors shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          View live demo — no account required
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <Link
          href="/login?mode=signup"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-(--color-border) text-sm font-medium text-(--color-text-secondary) hover:bg-(--color-bg) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          Create free account
        </Link>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

function Pricing() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-4">
          <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">
            Start free. Upgrade when you need more.
          </h2>
        </div>
        <p className="text-center text-sm text-(--color-text-muted) mb-10 max-w-lg mx-auto">
          Every plan includes full acceptance certificates, PDF downloads, and third-party
          verification. No plan locks you out of your evidence.
        </p>
        <LandingPricingClient />
        <p className="text-center text-sm text-(--color-text-muted) mt-2 mb-3">
          Free plan available — no credit card required.
        </p>
        <p className="text-center">
          <Link
            href="/pricing"
            className="text-sm text-(--color-accent) font-medium hover:text-(--color-accent-hover) transition-colors"
          >
            View full pricing and feature comparison →
          </Link>
        </p>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'Is this legally binding?',
    a: "OfferAccept records verifiable acceptance evidence — the legal effect depends on your jurisdiction, document type, and the law governing the agreement between the parties. It is not a substitute for formal legal advice. In many commercial contexts, documented email-verified acceptance is sufficient evidence of agreement.",
  },
  {
    q: 'How is this different from DocuSign?',
    a: "DocuSign is an e-signature platform for formal contracts requiring a legal signature. OfferAccept is for proving acceptance — it records who accepted, when, what version they saw, and verifies their email via one-time code. It is not a signature tool, and we don't claim to be.",
  },
  {
    q: 'What does the certificate actually prove?',
    a: "The certificate proves: (1) a specific email address was verified by one-time code immediately before acceptance, (2) the exact document version accepted — SHA-256 fingerprinted, (3) the precise timestamp, and (4) that the record has not been altered since issuance. It does not prove the identity of the person behind the email address.",
  },
  {
    q: 'Can recipients verify records independently?',
    a: "Yes. Any third party can verify a certificate using the certificate ID at offeraccept.com/verify — no account required. The PDF also embeds the full JSON record, so anyone can recompute the SHA-256 hash offline using standard tools and confirm the record has not been tampered with.",
  },
  {
    q: 'What happens if someone disputes acceptance?',
    a: "The certificate records the verified email, the exact document version, the timestamp, the IP address, and device information. The audit trail is immutable — it cannot be deleted or modified. This creates a factual record that is difficult to credibly dispute.",
  },
  {
    q: 'Do recipients need an account?',
    a: "No. Recipients receive a secure link by email. They open the link, verify their email with a one-time code, review the document, and click Accept. No account, no app, no password required.",
  },
  {
    q: 'What happens if the link expires?',
    a: "Acceptance links expire after a period set by the sender. If a recipient tries to access an expired link, they see a clear message explaining the link has expired and how to contact the sender. The sender is notified and can re-send.",
  },
  {
    q: 'Can I use this for employment offers?',
    a: "Yes, in many cases. OfferAccept is commonly used for offer letter acceptance where a record of when and what was accepted matters more than a formal signature. Consult your legal team for jurisdiction-specific guidance on employment contract requirements.",
  },
  {
    q: 'Can I download the certificate?',
    a: "Yes. The certificate is available as a PDF download immediately after acceptance, and from the sender's dashboard at any time afterward. The PDF embeds the full cryptographic record and can be verified independently.",
  },
  {
    q: 'Does OfferAccept verify identity?',
    a: "No. OfferAccept verifies control of an email address — the recipient proves they can receive and read email at that address. It does not verify the person's legal identity, government ID, or physical presence. If identity verification is required, use a dedicated identity verification service.",
  },
] as const;

function Faq() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-20">
      <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) text-center mb-12">
        Common questions
      </h2>
      <dl className="space-y-4">
        {FAQ_ITEMS.map((item) => (
          <div
            key={item.q}
            className="rounded-xl border border-(--color-border) bg-(--color-surface) p-6"
          >
            <dt className="font-semibold text-(--color-text-primary) mb-2">{item.q}</dt>
            <dd className="text-sm text-(--color-text-muted) leading-relaxed">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="bg-(--color-accent) py-20">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-3">
          Stop relying on &ldquo;I agree&rdquo; emails
        </h2>
        <p className="text-white/80 text-base mb-8">Get verifiable proof instead.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-(--color-accent) font-semibold text-sm hover:bg-(--color-accent-light) transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-accent)"
          >
            View live demo →
          </Link>
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/40 text-white font-medium text-sm hover:bg-white/10 transition-colors"
          >
            Create free account
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Legal clarification ──────────────────────────────────────────────────────

function LegalClarification() {
  return (
    <section aria-label="Legal information" className="border-t border-(--color-border-subtle) bg-(--color-bg)">
      <div className="max-w-3xl mx-auto px-6 py-10 text-center">
        <p className="text-sm text-(--color-text-secondary) leading-relaxed mb-2">
          OfferAccept records verifiable evidence that a document was accepted.
        </p>
        <p className="text-sm text-(--color-text-secondary) leading-relaxed mb-4">
          It is not a qualified electronic signature service under EU Regulation 910/2014 (eIDAS).
          The legal effect of any acceptance record depends on the law governing the agreement
          between the parties.
        </p>
        <p className="text-xs text-(--color-text-muted)">
          Recipients who have questions about the legal status of an acceptance record should seek
          independent legal advice.
        </p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="border-t border-(--color-border-subtle) py-8">
      <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-(--color-text-muted)">© 2026 OfferAccept. All rights reserved.</p>
        <nav className="flex items-center gap-4" aria-label="Footer navigation">
          {[
            { label: 'Demo', href: '/demo' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Verify', href: '/verify' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
            { label: 'Contact', href: '/contact' },
          ].map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
