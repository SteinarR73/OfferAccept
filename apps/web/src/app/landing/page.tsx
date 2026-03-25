import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OfferAccept — Deal acceptance and agreement confirmation',
  description:
    'Send deals, collect OTP-verified acceptance, and receive tamper-proof acceptance certificates. Not an e-signature tool.',
};

// ─── Landing page (server component — zero API calls) ────────────────────────

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">
      <LandingNav />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <CertificatePreview />
        <PricingBand />
      </main>
      <LandingFooter />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-900 text-sm select-none">
          <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            OA
          </span>
          OfferAccept
        </div>
        <Link
          href="/login"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
        >
          Sign in →
        </Link>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 mb-6">
        <span aria-hidden="true">✦</span>
        Trusted by 500+ employers
      </div>

      <h1 className="text-5xl font-bold tracking-tight text-gray-900 leading-tight mb-5">
        Send deals.<br />Get verified acceptance.{' '}
        <span className="text-blue-600">Instantly.</span>
      </h1>

      <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8 leading-relaxed">
        OfferAccept collects verifiable deal acceptance via a secure email link —
        no account required for recipients. Every acceptance produces a tamper-proof certificate.
      </p>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Start for free
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
        <a
          href="#how-it-works"
          className="inline-flex items-center gap-1 px-5 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          See how it works
        </a>
      </div>

      {/* Simple browser-mockup illustration */}
      <div className="mt-14 max-w-2xl mx-auto rounded-xl border border-gray-200 shadow-md overflow-hidden">
        <div className="bg-gray-100 flex items-center gap-1.5 px-4 py-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <span className="flex-1 ml-2 h-5 bg-white rounded text-[10px] text-gray-400 flex items-center px-3">
            offeraccept.com/sign/oa_abc123…
          </span>
        </div>
        <div className="bg-white px-6 py-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">OA</div>
            <div>
              <p className="text-xs font-semibold text-gray-900">Acme Corp has sent you a deal</p>
              <p className="text-xs text-gray-400 mt-0.5">Senior Engineer — Q1 2026</p>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            {['Offer letter.pdf', 'Compensation summary.pdf'].map((name) => (
              <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                <span className="w-6 h-6 rounded bg-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">PDF</span>
                <span className="text-xs text-gray-700">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-xs text-white font-medium">Accept deal</div>
            <div className="flex-1 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-xs text-gray-500">Decline</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ─────────────────────────────────────────────────────────────

const TRUST = [
  { icon: '🔒', label: '256-bit encryption', desc: 'End-to-end secure' },
  { icon: '📜', label: 'Tamper-proof certs', desc: 'SHA-256 hash chain' },
  { icon: '✉️', label: 'OTP-verified identity', desc: 'Recipient confirmed' },
  { icon: '⏱', label: '15-min access tokens', desc: 'Time-limited links' },
];

function TrustStrip() {
  return (
    <section aria-label="Trust indicators" className="border-y border-gray-100 bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TRUST.map((t) => (
          <div key={t.label} className="flex items-center gap-3">
            <span className="text-xl" role="img" aria-label={t.label}>{t.icon}</span>
            <div>
              <p className="text-xs font-semibold text-gray-900">{t.label}</p>
              <p className="text-[11px] text-gray-500">{t.desc}</p>
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
    desc: 'Recipient verifies identity via OTP, reviews documents, and confirms. Certificate issued immediately.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900">How it works</h2>
        <p className="mt-2 text-gray-500 text-sm">Three steps from draft to verified acceptance.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {STEPS.map((step) => (
          <div key={step.n} className="flex flex-col items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {step.n}
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">{step.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Certificate Preview ──────────────────────────────────────────────────────

function CertificatePreview() {
  return (
    <section className="bg-gray-50 border-y border-gray-100 py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900">See what gets generated</h2>
          <p className="mt-2 text-gray-500 text-sm max-w-md mx-auto">
            Every accepted deal produces a tamper-proof acceptance certificate — verifiable by any third party.
          </p>
        </div>

        {/* Mock certificate card */}
        <div className="max-w-lg mx-auto rounded-xl border border-gray-200 bg-white shadow-md overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-green-50">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-green-800">Acceptance Certificate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">OA</span>
              <span className="text-xs text-gray-500 font-medium">OfferAccept</span>
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
                <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
                <span className="text-xs text-gray-900 font-medium">{value}</span>
              </div>
            ))}

            <div className="border-t border-gray-100 pt-3 space-y-2">
              {[
                { label: 'Certificate ID', value: 'cert_01HX2K9A…' },
                { label: 'SHA-256 Hash', value: 'a3f1b9c2d4e5f6a7…' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4">
                  <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
                  <code className="text-[11px] text-gray-600 font-mono">{value}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <a href="#" className="text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors">
              Verify this certificate →
            </a>
            <span className="text-[10px] text-gray-400">tamper-evident · cryptographically sealed</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing band ─────────────────────────────────────────────────────────────

function PricingBand() {
  return (
    <section className="bg-blue-600 py-16">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Start free — 3 deals per month</h2>
        <p className="text-blue-200 text-sm mb-6">No credit card required. Upgrade any time as you grow.</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-blue-600 font-semibold text-sm hover:bg-blue-50 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-600"
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

// ─── Footer ───────────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="border-t border-gray-100 py-8">
      <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-gray-400">© 2026 OfferAccept. All rights reserved.</p>
        <nav className="flex items-center gap-4" aria-label="Footer navigation">
          {['Privacy', 'Terms', 'Contact'].map((item) => (
            <a key={item} href="#" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              {item}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
