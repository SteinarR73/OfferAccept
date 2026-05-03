import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — OfferAccept',
  description:
    'Simple, transparent pricing. Start free with 3 deals per month. Upgrade as you grow.',
};

// ─── Pricing page (server component) ─────────────────────────────────────────

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-(--color-surface) text-(--color-text-primary) flex flex-col">
      <PricingNav />
      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-3">Simple, honest pricing</h1>
          <p className="text-(--color-text-muted) text-base max-w-md mx-auto leading-relaxed">
            Start free. No credit card required. Upgrade when your volume grows.
          </p>
        </div>

        <PlanGrid />
        <UsageGuidance />
        <FeatureTable />
        <Faq />
        <Legal />
      </main>
      <PricingFooter />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function PricingNav() {
  return (
    <header className="sticky top-0 z-30 bg-(--color-surface)/90 backdrop-blur border-b border-(--color-border-subtle)">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-(--color-text-primary) text-sm select-none"
        >
          <span className="w-7 h-7 rounded-lg bg-(--color-accent) flex items-center justify-center text-white text-xs font-bold">
            OA
          </span>
          OfferAccept
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login?mode=signup"
            className="text-sm font-medium text-white bg-(--color-accent) hover:bg-(--color-accent-hover) transition-colors px-3 py-1.5 rounded-lg"
          >
            Get started →
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  desc: string;
  deals: string;
  cta: string;
  ctaHref: string;
  featured: boolean;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'Try OfferAccept at no cost. Perfect for occasional use.',
    deals: '3 deals / month',
    cta: 'Get started free',
    ctaHref: '/login?mode=signup',
    featured: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    period: 'per month',
    desc: 'For freelancers and small teams who send deals regularly.',
    deals: '25 deals / month',
    cta: 'Start free trial',
    ctaHref: '/login?mode=signup&plan=starter',
    featured: true,
    badge: 'Most popular',
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$79',
    period: 'per month',
    desc: 'For growing businesses with higher volume and team needs.',
    deals: '100 deals / month',
    cta: 'Start free trial',
    ctaHref: '/login?mode=signup&plan=professional',
    featured: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'Unlimited deals, dedicated support, SLA, and DPA on request.',
    deals: 'Unlimited deals',
    cta: 'Contact us',
    ctaHref: '/contact',
    featured: false,
  },
];

// ─── Plan grid ────────────────────────────────────────────────────────────────

function PlanGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={
            plan.featured
              ? 'rounded-2xl border-2 border-(--color-accent) bg-(--color-surface) shadow-md flex flex-col relative'
              : 'rounded-2xl border border-(--color-border) bg-(--color-surface) shadow-sm flex flex-col'
          }
        >
          {plan.badge && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="bg-(--color-accent) text-white text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                {plan.badge}
              </span>
            </div>
          )}

          <div className="px-5 pt-7 pb-5 flex-1 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-widest text-(--color-text-muted) mb-1">
              {plan.name}
            </p>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl font-bold text-(--color-text-primary)">{plan.price}</span>
              {plan.period && (
                <span className="text-sm text-(--color-text-muted)">{plan.period}</span>
              )}
            </div>
            <p className="text-xs font-semibold text-(--color-accent) mb-3">{plan.deals}</p>
            <p className="text-sm text-(--color-text-secondary) leading-relaxed flex-1">
              {plan.desc}
            </p>
          </div>

          <div className="px-5 pb-6">
            <Link
              href={plan.ctaHref}
              className={
                plan.featured
                  ? 'block w-full text-center px-4 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors'
                  : 'block w-full text-center px-4 py-2.5 rounded-lg border border-(--color-border) text-(--color-text-primary) text-sm font-medium hover:bg-(--color-bg) transition-colors'
              }
            >
              {plan.cta}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Usage guidance ───────────────────────────────────────────────────────────

function UsageGuidance() {
  return (
    <div className="mb-12 max-w-2xl mx-auto rounded-xl border border-(--color-border) bg-(--color-surface) px-8 py-6">
      <h3 className="text-sm font-bold text-(--color-text-primary) uppercase tracking-wide mb-5 text-center">
        When to use OfferAccept
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] font-semibold text-(--color-success-text) uppercase tracking-wide mb-3">
            Best for
          </p>
          <ul className="space-y-2">
            {['Offers', 'Approvals', 'Confirmations'].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
                <span className="text-(--color-success) font-bold" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide mb-3">
            Not designed for
          </p>
          <ul className="space-y-2">
            {[
              'Formal legal signatures',
              'Regulated agreements requiring e-signature',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-(--color-text-secondary)">
                <span className="text-red-400 font-bold flex-shrink-0 mt-0.5" aria-hidden="true">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Feature table ────────────────────────────────────────────────────────────

const FEATURES = [
  { label: 'Deals per month', free: '3', starter: '25', pro: '100', ent: 'Unlimited' },
  { label: 'Acceptance certificates',  free: '✓', starter: '✓', pro: '✓', ent: '✓' },
  { label: 'SHA-256 audit trail',       free: '✓', starter: '✓', pro: '✓', ent: '✓' },
  { label: 'PDF certificate download',  free: '✓', starter: '✓', pro: '✓', ent: '✓' },
  { label: 'Third-party verification',  free: '✓', starter: '✓', pro: '✓', ent: '✓' },
  { label: 'Document attachments',      free: '✓', starter: '✓', pro: '✓', ent: '✓' },
  { label: 'Recipient reminders',       free: '—', starter: '✓', pro: '✓', ent: '✓' },
  { label: 'API access',                free: '—', starter: '—', pro: '✓', ent: '✓' },
  { label: 'Webhooks',                  free: '—', starter: '—', pro: '✓', ent: '✓' },
  { label: 'Team members',              free: '1', starter: '3', pro: '10', ent: 'Unlimited' },
  { label: 'SLA',                       free: '—', starter: '—', pro: '—', ent: '✓' },
  { label: 'Data Processing Agreement', free: '—', starter: '—', pro: '✓', ent: '✓' },
  { label: 'Dedicated support',         free: '—', starter: 'Email', pro: 'Priority', ent: 'Dedicated' },
];

const COL_HEADERS = ['Feature', 'Free', 'Starter', 'Professional', 'Enterprise'];

function FeatureTable() {
  return (
    <div className="mb-16">
      <h2 className="text-xl font-bold mb-6 text-center text-(--color-text-primary)">
        Full feature comparison
      </h2>
      <div className="overflow-x-auto rounded-xl border border-(--color-border) shadow-sm">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="bg-(--color-bg) border-b border-(--color-border-subtle)">
              {COL_HEADERS.map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide ${
                    i === 0
                      ? 'text-left text-(--color-text-muted) w-1/3'
                      : 'text-center text-(--color-text-secondary)'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((row, i) => (
              <tr
                key={row.label}
                className={i % 2 === 0 ? 'bg-(--color-surface)' : 'bg-(--color-bg)'}
              >
                <td className="px-5 py-3 text-(--color-text-secondary) font-medium">
                  {row.label}
                </td>
                {([row.free, row.starter, row.pro, row.ent] as string[]).map((val, j) => (
                  <td key={j} className="px-5 py-3 text-center">
                    <span
                      className={
                        val === '✓' || (!val.includes('—') && val !== '')
                          ? 'text-(--color-success-text) font-medium'
                          : 'text-(--color-text-muted)'
                      }
                    >
                      {val}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'Is OfferAccept a legal e-signature platform?',
    a: 'No. OfferAccept records verifiable evidence that a recipient accepted a document — it is not a qualified electronic signature service under EU Regulation 910/2014 (eIDAS). For situations requiring a legally binding signature, use a qualified e-signature provider. For everything else, OfferAccept\'s acceptance evidence is faster and simpler.',
  },
  {
    q: 'What happens when I hit the monthly deal limit?',
    a: 'New deals cannot be sent until the next billing cycle resets your count, or you upgrade. Existing deals and their certificates remain accessible regardless of your plan.',
  },
  {
    q: 'Do my recipients need an account?',
    a: 'No. Recipients receive a secure email link. They review the document, verify their email via a one-time code, and confirm — no account, no app, no password.',
  },
  {
    q: 'How long are acceptance certificates retained?',
    a: 'Certificates and their underlying evidence records are retained for a minimum of 10 years after acceptance. Immutable evidence tables (AcceptanceRecord, OfferSnapshot, SigningEvents) are never deleted.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. Each certificate can be exported as a standalone JSON object containing the cryptographic proof. The SHA-256 hash allows any third party to verify the record independently, without contacting OfferAccept.',
  },
  {
    q: 'Is there a Data Processing Agreement (DPA)?',
    a: 'A DPA is available on the Professional and Enterprise plans. Contact us at privacy@offeraccept.com to request one.',
  },
];

function Faq() {
  return (
    <div className="mb-16">
      <h2 className="text-xl font-bold mb-8 text-center text-(--color-text-primary)">
        Frequently asked questions
      </h2>
      <div className="max-w-2xl mx-auto space-y-6">
        {FAQ_ITEMS.map((item) => (
          <div key={item.q} className="border-b border-(--color-border-subtle) pb-6 last:border-0">
            <p className="text-sm font-semibold text-(--color-text-primary) mb-2">{item.q}</p>
            <p className="text-sm text-(--color-text-secondary) leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Legal footnote ───────────────────────────────────────────────────────────

function Legal() {
  return (
    <div className="text-center border-t border-(--color-border-subtle) pt-10">
      <p className="text-xs text-(--color-text-muted) max-w-lg mx-auto leading-relaxed mb-2">
        OfferAccept is not a qualified electronic signature service under EU Regulation 910/2014 (eIDAS).
        The legal effect of any acceptance record depends on the law governing the underlying agreement.
      </p>
      <div className="flex items-center justify-center gap-4 mt-3">
        <Link href="/privacy" className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors">
          Privacy policy
        </Link>
        <Link href="/terms" className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors">
          Terms of service
        </Link>
        <Link href="/contact" className="text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors">
          Contact
        </Link>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function PricingFooter() {
  return (
    <footer className="border-t border-(--color-border-subtle) py-6 mt-8">
      <p className="text-center text-xs text-(--color-text-muted)">
        © 2026 OfferAccept. All rights reserved.
      </p>
    </footer>
  );
}
