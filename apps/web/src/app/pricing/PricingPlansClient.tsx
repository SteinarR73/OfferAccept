'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Cycle = 'monthly' | 'yearly';

interface PlanDef {
  id: string;
  name: string;
  monthly: number | null;
  yearly: number | null;
  deals: string;
  desc: string;
  features: readonly string[];
  cta: string;
  ctaHref: string;
  featured: boolean;
}

// ─── Plan definitions (USD) ───────────────────────────────────────────────────

const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    deals: '3 documents / month',
    desc: 'Try OfferAccept at no cost. Perfect for occasional use.',
    features: ['OTP-verified signing', 'PDF acceptance certificate', 'Tamper-evident audit log', 'No account needed for recipient'],
    cta: 'Get started free',
    ctaHref: '/login?mode=signup',
    featured: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    monthly: 18,
    yearly: 15,
    deals: '20 documents / month',
    desc: 'For freelancers and small businesses replacing email confirmations.',
    features: ['Everything in Free', 'Custom email sender name', 'Document history & search', 'Recipient reminders'],
    cta: 'Get Starter',
    ctaHref: '/login?mode=signup&plan=starter',
    featured: true,
  },
  {
    id: 'team',
    name: 'Team',
    monthly: 47,
    yearly: 39,
    deals: '75 documents / month',
    desc: 'For small teams sending proposals, quotes and approvals regularly.',
    features: ['Everything in Starter', 'Multi-user workspace', 'Template library', 'Priority email support'],
    cta: 'Start Team',
    ctaHref: '/login?mode=signup&plan=team',
    featured: false,
  },
  {
    id: 'business',
    name: 'Business',
    monthly: 95,
    yearly: 79,
    deals: '250 documents / month',
    desc: 'For growing companies needing integrations and higher volume.',
    features: ['Everything in Team', 'REST API & webhooks', 'Zapier integration', 'Custom branding'],
    cta: 'Start Business',
    ctaHref: '/login?mode=signup&plan=business',
    featured: false,
  },
];

// ─── Toggle ───────────────────────────────────────────────────────────────────

function BillingToggle({ cycle, onChange }: { cycle: Cycle; onChange: (c: Cycle) => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5 mb-10">
      {/* "Recommended" label always points to Yearly */}
      <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-widest">
        Recommended
      </p>

      <div
        className="inline-flex items-center rounded-xl border border-(--color-border) bg-(--color-bg) p-1 gap-1"
        role="group"
        aria-label="Billing cycle"
      >
        {/* Monthly — muted, plain */}
        <button
          type="button"
          onClick={() => onChange('monthly')}
          aria-pressed={cycle === 'monthly' ? true : false}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-1 cursor-pointer ${
            cycle === 'monthly'
              ? 'bg-white text-(--color-text-primary) shadow-sm'
              : 'text-(--color-text-muted) hover:text-(--color-text-secondary)'
          }`}
        >
          Monthly
        </button>

        {/* Yearly — always prominent, green when active */}
        <button
          type="button"
          onClick={() => onChange('yearly')}
          aria-pressed={cycle === 'yearly' ? true : false}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 cursor-pointer ${
            cycle === 'yearly'
              ? 'bg-emerald-500 text-white shadow-md'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          Yearly
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
              cycle === 'yearly'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-200 text-emerald-800'
            }`}
          >
            save ~17%
          </span>
        </button>
      </div>

      {/* Monthly mode: global nudge below the toggle */}
      {cycle === 'monthly' && (
        <p className="text-xs text-(--color-text-muted) mt-0.5">
          Switch to yearly and{' '}
          <button
            type="button"
            onClick={() => onChange('yearly')}
            className="text-emerald-600 font-semibold underline underline-offset-2 hover:text-emerald-700 cursor-pointer"
          >
            save up to $16/month
          </button>
        </p>
      )}
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  cycle,
  onSwitchToYearly,
}: {
  plan: PlanDef;
  cycle: Cycle;
  onSwitchToYearly: () => void;
}) {
  const price = cycle === 'yearly' ? plan.yearly : plan.monthly;
  const isFree = price === 0;
  const monthlySaving =
    plan.monthly !== null && plan.yearly !== null ? plan.monthly - plan.yearly : 0;

  return (
    <div
      className={`rounded-2xl border flex flex-col relative ${
        plan.featured
          ? 'border-2 border-(--color-accent) bg-(--color-surface) shadow-md'
          : 'border-(--color-border) bg-(--color-surface) shadow-sm'
      }`}
    >
      {plan.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-(--color-accent) text-white text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
            Most popular
          </span>
        </div>
      )}

      <div className="px-5 pt-7 pb-5 flex-1 flex flex-col">
        <p className="text-xs font-semibold uppercase tracking-widest text-(--color-text-muted) mb-2">
          {plan.name}
        </p>

        {/* Price block */}
        <div className="mb-1">
          {isFree ? (
            <span className="text-3xl font-bold text-(--color-text-primary)">Free</span>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-(--color-text-primary)">
                  ${price}
                </span>
                <span className="text-sm text-(--color-text-muted)">/month</span>
              </div>

              <p className="text-xs text-(--color-text-muted) mt-0.5">
                {cycle === 'yearly' ? 'billed yearly' : 'billed monthly'}
              </p>

              {cycle === 'yearly' ? (
                <span className="inline-block mt-1.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  Save ~17%
                </span>
              ) : (
                monthlySaving > 0 && (
                  <button
                    type="button"
                    onClick={onSwitchToYearly}
                    className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer group"
                    title="Switch to yearly billing"
                  >
                    <span className="group-hover:underline underline-offset-2">
                      Save ${monthlySaving}/mo with yearly
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                )
              )}
            </>
          )}
        </div>

        <p className="text-xs font-semibold text-(--color-accent) mt-3 mb-1">{plan.deals}</p>
        <p className="text-sm text-(--color-text-secondary) leading-relaxed mb-3">{plan.desc}</p>
        <ul className="space-y-1.5 flex-1">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-(--color-text-secondary)">
              <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 pb-6">
        <Link
          href={plan.ctaHref}
          className={`block w-full text-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            plan.featured
              ? 'bg-(--color-accent) text-white hover:bg-(--color-accent-hover)'
              : 'border border-(--color-border) text-(--color-text-primary) hover:bg-(--color-bg)'
          }`}
        >
          {plan.cta}
        </Link>
      </div>
    </div>
  );
}

// ─── PricingPlansClient ────────────────────────────────────────────────────────

export function PricingPlansClient() {
  const [cycle, setCycle] = useState<Cycle>('yearly');

  return (
    <>
      <BillingToggle cycle={cycle} onChange={setCycle} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            onSwitchToYearly={() => setCycle('yearly')}
          />
        ))}
      </div>
    </>
  );
}
