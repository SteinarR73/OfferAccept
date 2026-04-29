import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OfferAccept — Send deals. Record acceptance.',
  description:
    'Send deals, collect OTP-verified acceptance, and receive tamper-proof acceptance certificates. Not an e-signature tool.',
};

// ─── Landing page (server component — zero API calls) ────────────────────────

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-(--color-surface) text-(--color-text-primary)">
      <LandingNav />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <WhyNotEmail />
        <VsEsign />
        <CertificatePreview />
        <PricingBand />
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
        <div className="flex items-center gap-2 font-semibold text-(--color-text-primary) text-sm select-none">
          <span className="w-7 h-7 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold">
            OA
          </span>
          OfferAccept
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded px-1"
          >
            Sign in
          </Link>
          <Link
            href="/login?mode=signup"
            className="text-sm font-medium text-white bg-(--color-accent) hover:bg-(--color-accent-hover) transition-colors px-3 py-1.5 rounded-lg focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
          >
            Get started →
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
      <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-6">
        <span aria-hidden="true">✦</span>
        Built for modern teams
      </div>

      <h1 className="font-serif text-5xl tracking-tight text-(--color-text-primary) leading-tight mb-5">
        Send deals.<br />Get verified acceptance.{' '}
        <span className="text-(--color-accent)">Instantly.</span>
      </h1>

      <p className="text-lg text-(--color-text-muted) max-w-xl mx-auto mb-4 leading-relaxed">
        OfferAccept collects verifiable deal acceptance via a secure email link —
        no account required for recipients. Every acceptance produces a tamper-evident certificate.
      </p>

      <p className="text-sm text-(--color-text-muted) max-w-md mx-auto mb-8">
        OfferAccept creates a tamper-evident record of acceptance. It is not an electronic signature platform.
      </p>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link
          href="/login?mode=signup"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-medium hover:bg-(--color-accent-hover) transition-colors shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
        >
          Start for free
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

      {/* Simple browser-mockup illustration */}
      <div className="mt-14 max-w-2xl mx-auto rounded-xl border border-(--color-border) shadow-md overflow-hidden" aria-hidden="true">
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
            <div className="w-8 h-8 rounded-full bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold flex-shrink-0">OA</div>
            <div>
              <p className="text-xs font-semibold text-(--color-text-primary)">Acme Corp has sent you a deal</p>
              <p className="text-xs text-(--color-text-muted) mt-0.5">Senior Engineer — Q1 2026</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            {['Deal summary.pdf', 'Compensation summary.pdf'].map((name) => (
              <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--color-bg) border border-(--color-border-subtle)">
                <span className="w-6 h-6 rounded bg-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">PDF</span>
                <span className="text-xs text-(--color-text-secondary)">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-9 rounded-lg bg-(--color-accent) flex items-center justify-center text-xs text-white font-medium">Review &amp; accept</div>
            <div className="flex-1 h-9 rounded-lg border border-(--color-border) flex items-center justify-center text-xs text-(--color-text-muted)">Decline</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ─────────────────────────────────────────────────────────────

const TRUST = [
  { label: 'TLS encryption', desc: 'Encrypted in transit' },
  { label: 'Tamper-evident certificates', desc: 'SHA-256 hash chain' },
  { label: 'OTP-verified email', desc: 'Recipient email confirmed' },
  { label: 'Time-limited signing links', desc: 'Signing links expire automatically.' },
];

function TrustStrip() {
  return (
    <section aria-label="Trust indicators" className="border-y border-(--color-border-subtle) bg-(--color-bg)">
      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TRUST.map((t) => (
          <div key={t.label} className="flex items-center gap-3">
            <svg className="w-5 h-5 text-(--color-accent) flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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

// ─── How It Works ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: '1',
    title: 'Draft the deal',
    desc: 'Add a title, personal message, attach documents (PDF, DOCX), and set an expiry date.',
  },
  {
    n: '2',
    title: 'Send via secure link',
    desc: 'One click. Your recipient receives a private email with a time-limited acceptance link.',
  },
  {
    n: '3',
    title: 'Get it accepted',
    desc: 'Recipient verifies identity via OTP, reviews documents, and accepts. Certificate issued immediately.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">How it works</h2>
        <p className="mt-2 text-(--color-text-muted) text-sm">Three steps from draft to verified acceptance.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {STEPS.map((step) => (
          <div key={step.n} className="flex flex-col items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-(--color-accent) flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {step.n}
            </div>
            <h3 className="font-semibold text-(--color-text-primary) text-sm">{step.title}</h3>
            <p className="text-sm text-(--color-text-muted) leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Why not email ────────────────────────────────────────────────────────────

const WHY_ITEMS = [
  { label: 'Who accepted', desc: 'Identity verified via a one-time code sent to their email address.' },
  { label: 'What was accepted', desc: 'The exact documents and deal title at the time of acceptance.' },
  { label: 'When acceptance occurred', desc: 'A precise UTC timestamp recorded on the acceptance event.' },
];

function WhyNotEmail() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-20">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary) mb-3">
          Why not just ask for &ldquo;I accept&rdquo; in email?
        </h2>
        <p className="text-(--color-text-muted) text-sm mb-10 leading-relaxed">
          Email replies can be forged, forwarded, or disputed. OfferAccept creates an independent
          record that neither party can alter after the fact.
        </p>

        <div className="space-y-5 mb-10">
          {WHY_ITEMS.map((item) => (
            <div key={item.label} className="flex items-start gap-4">
              <div className="w-5 h-5 rounded-full bg-(--color-accent) flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-(--color-text-primary)">{item.label}</p>
                <p className="text-sm text-(--color-text-muted) mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-(--color-text-secondary) border-l-4 border-(--color-accent) pl-4 leading-relaxed">
          Each acceptance produces a tamper-proof certificate that anyone can verify independently —
          without an account and without contacting OfferAccept.
        </p>
      </div>
    </section>
  );
}

// ─── Vs e-sign ────────────────────────────────────────────────────────────────

const VS_ROWS = [
  {
    topic: 'Recipient account required',
    oa: { value: 'No', good: true },
    esign: { value: 'Yes', good: false },
  },
  {
    topic: 'Recipient app / plugin',
    oa: { value: 'No', good: true },
    esign: { value: 'Sometimes', good: false },
  },
  {
    topic: 'Time to first acceptance',
    oa: { value: '< 60 seconds', good: true },
    esign: { value: '3 – 10 minutes', good: false },
  },
  {
    topic: 'Legally binding e-signature (eIDAS)',
    oa: { value: 'No — acceptance evidence', good: false },
    esign: { value: 'Yes', good: true },
  },
  {
    topic: 'Tamper-evident audit trail',
    oa: { value: 'Yes — SHA-256 hash chain', good: true },
    esign: { value: 'Yes', good: true },
  },
  {
    topic: 'Third-party verification (no login)',
    oa: { value: 'Yes', good: true },
    esign: { value: 'Varies', good: false },
  },
  {
    topic: 'Price per deal (low volume)',
    oa: { value: 'Free up to 3/mo', good: true },
    esign: { value: '$5 – $20+', good: false },
  },
];

function VsEsign() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">
          Prove acceptance — without the friction of e-signature
        </h2>
        <p className="mt-3 text-(--color-text-muted) text-sm max-w-xl mx-auto leading-relaxed">
          Qualified e-signatures are the right tool when you need a legally binding signature
          under eIDAS or equivalent law. For everything else — offer letters, NDAs, scope of
          work confirmations — OfferAccept is faster and simpler, with the same audit trail.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-(--color-border) shadow-sm">
        <table className="w-full text-sm" role="table" aria-label="Feature comparison">
          <thead>
            <tr className="bg-(--color-bg) border-b border-(--color-border-subtle)">
              <th className="text-left px-5 py-3 text-xs font-semibold text-(--color-text-muted) uppercase tracking-wide w-1/2">
                Feature
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-(--color-accent) uppercase tracking-wide">
                OfferAccept
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-(--color-text-muted) uppercase tracking-wide">
                DocuSign / e-sign
              </th>
            </tr>
          </thead>
          <tbody>
            {VS_ROWS.map((row, i) => (
              <tr
                key={row.topic}
                className={i % 2 === 0 ? 'bg-(--color-surface)' : 'bg-(--color-bg)'}
              >
                <td className="px-5 py-3 text-(--color-text-secondary) font-medium">
                  {row.topic}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={row.oa.good ? 'text-(--color-success-text) font-semibold' : 'text-(--color-text-muted)'}>
                    {row.oa.good ? '✓ ' : ''}{row.oa.value}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={row.esign.good ? 'text-(--color-success-text) font-semibold' : 'text-(--color-text-muted)'}>
                    {row.esign.good ? '✓ ' : ''}{row.esign.value}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-(--color-text-muted) text-center mt-4 leading-relaxed max-w-lg mx-auto">
        OfferAccept is not a qualified electronic signature service under EU Regulation 910/2014.
        The legal weight of an acceptance record depends on the law governing the agreement.
        Seek legal advice if a binding signature is required.
      </p>
    </section>
  );
}

// ─── Certificate Preview ──────────────────────────────────────────────────────

function CertificatePreview() {
  return (
    <section className="bg-(--color-bg) border-y border-(--color-border-subtle) py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight text-(--color-text-primary)">See what gets generated</h2>
          <p className="mt-2 text-(--color-text-muted) text-sm max-w-md mx-auto">
            Every accepted deal produces a tamper-proof acceptance certificate — verifiable by any third party.
          </p>
        </div>

        {/* Mock certificate card */}
        <div className="max-w-lg mx-auto rounded-xl border border-(--color-border) bg-(--color-surface) shadow-md overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-(--color-border-subtle) bg-(--color-success-light)">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-(--color-success) flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-(--color-success-text)">Acceptance Certificate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-md bg-(--color-accent) flex items-center justify-center text-white text-[9px] font-bold">OA</span>
              <span className="text-xs text-(--color-text-muted) font-medium">OfferAccept</span>
            </div>
          </div>

          {/* Fields */}
          <div className="px-5 py-4 space-y-3">
            {[
              { label: 'Deal', value: 'Senior Engineer — Q1 2026' },
              { label: 'Accepted', value: 'March 22, 2026 at 14:32 UTC' },
              { label: 'By', value: '████████████@company.com' },
              { label: 'Method', value: 'OTP-verified email' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4">
                <span className="text-xs text-(--color-text-muted) w-20 flex-shrink-0 pt-0.5">{label}</span>
                <span className="text-xs text-(--color-text-primary) font-medium">{value}</span>
              </div>
            ))}

            <div className="border-t border-(--color-border-subtle) pt-3 space-y-2">
              {[
                { label: 'Certificate ID', value: 'cert_01HX2K9A…' },
                { label: 'SHA-256 Hash', value: 'a3f1b9c2d4e5f6a7…' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4">
                  <span className="text-xs text-(--color-text-muted) w-20 flex-shrink-0 pt-0.5">{label}</span>
                  <code className="text-[11px] text-(--color-text-secondary) font-mono">{value}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-(--color-border-subtle) bg-(--color-bg) flex items-start justify-between gap-3">
            <div>
              <Link
                href="/verify"
                className="text-xs text-(--color-accent) font-medium hover:text-(--color-accent-hover) transition-colors"
              >
                Verify a certificate →
              </Link>
              <p className="text-[10px] text-(--color-text-muted) mt-0.5">Paste a Certificate ID to verify any acceptance.</p>
            </div>
            <span className="text-[10px] text-(--color-text-muted) flex-shrink-0 pt-0.5">tamper-evident · cryptographically sealed</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing band ─────────────────────────────────────────────────────────────

function PricingBand() {
  return (
    <section className="bg-(--color-accent) py-16">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Start free — 3 deals per month</h2>
        <p className="text-white/80 text-sm mb-6">No credit card required. Upgrade any time as you grow.</p>
        <p className="text-white/70 text-sm mb-6">
          Need more?{' '}
          <Link href="/pricing" className="underline underline-offset-2 hover:text-white transition-colors">
            See all plans →
          </Link>
        </p>
        <Link
          href="/login?mode=signup"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-(--color-accent) font-semibold text-sm hover:bg-(--color-accent-light) transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-accent)"
        >
          Get started for free
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
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
            { label: 'Pricing', href: '/pricing' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
            { label: 'Contact', href: '/contact' },
          ].map(({ label, href }) => (
            <Link key={label} href={href} className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
