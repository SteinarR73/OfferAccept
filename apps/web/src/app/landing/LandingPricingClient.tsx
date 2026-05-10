'use client';

import { useState } from 'react';
import Link from 'next/link';

type Cycle = 'yearly' | 'monthly';

interface PlanDef {
  id: string;
  name: string;
  yearly: number;
  monthly: number;
  docs: string;
  cta: string;
  href: string;
  highlight: boolean;
  features: readonly string[];
}

// Feature continuity: each plan explicitly includes the lower plan.
const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    yearly: 0,
    monthly: 0,
    docs: '3 documents',
    cta: 'Get started free',
    href: '/login?mode=signup',
    highlight: false,
    features: [
      'Full acceptance certificates',
      'Downloadable PDF certificate',
      'Third-party verification (no account needed)',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    yearly: 15,
    monthly: 19,
    docs: '20 documents',
    cta: 'Start Starter',
    href: '/login?mode=signup&plan=starter',
    highlight: true,
    features: [
      'Everything in Free',
      'Recipient reminders',
      'Data Processing Agreement',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    yearly: 39,
    monthly: 49,
    docs: '75 documents',
    cta: 'Start Team',
    href: '/login?mode=signup&plan=team',
    highlight: false,
    features: [
      'Everything in Starter',
      'Up to 10 team members',
      'Priority support',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    yearly: 79,
    monthly: 99,
    docs: '250 documents',
    cta: 'Start Business',
    href: '/login?mode=signup&plan=business',
    highlight: false,
    features: [
      'Everything in Team',
      'API access + webhooks',
      'Custom Data Processing Agreement',
    ],
  },
];

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-(--color-accent) flex-shrink-0 mt-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── LandingPricingClient ──────────────────────────────────────────────────────

export function LandingPricingClient() {
  const [cycle, setCycle] = useState<Cycle>('yearly');

  return (
    <>
      {/* Billing toggle */}
      <div className="flex items-center justify-center mb-8">
        <div
          className="inline-flex items-center rounded-lg border border-(--color-border) bg-(--color-bg) p-1 gap-1"
          role="group"
          aria-label="Billing cycle"
        >
          <button
            type="button"
            onClick={() => setCycle('monthly')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) ${
              cycle === 'monthly'
                ? 'bg-(--color-surface) text-(--color-text-primary) shadow-sm'
                : 'text-(--color-text-muted) hover:text-(--color-text-secondary)'
            }`}
            aria-pressed={cycle === 'monthly'}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle('yearly')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) flex items-center gap-2 ${
              cycle === 'yearly'
                ? 'bg-(--color-surface) text-(--color-text-primary) shadow-sm'
                : 'text-(--color-text-muted) hover:text-(--color-text-secondary)'
            }`}
            aria-pressed={cycle === 'yearly'}
          >
            Yearly
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
              save ~20%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {PLANS.map((plan) => {
          const price = cycle === 'yearly' ? plan.yearly : plan.monthly;
          const isFree = price === 0;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border flex flex-col p-5 gap-4 ${
                plan.highlight
                  ? 'border-(--color-accent) bg-(--color-surface) shadow-md ring-1 ring-(--color-accent)'
                  : 'border-(--color-border) bg-(--color-surface)'
              }`}
            >
              {plan.highlight && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-(--color-accent)">
                  Most popular
                </span>
              )}
              <div>
                <p className="font-semibold text-(--color-text-primary) mb-1">{plan.name}</p>
                {isFree ? (
                  <p className="text-2xl font-bold text-(--color-text-primary)">Free</p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-(--color-text-primary)">${price}</span>
                      <span className="text-xs text-(--color-text-muted)">/month</span>
                    </div>
                    <p className="text-xs text-(--color-text-muted) mt-0.5">
                      {cycle === 'yearly' ? 'billed yearly' : 'billed monthly'}
                    </p>
                  </>
                )}
                <p className="text-xs font-semibold text-(--color-accent) mt-2">{plan.docs}/month</p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm text-(--color-text-secondary)">
                    <CheckIcon />
                    {feat}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`text-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  plan.highlight
                    ? 'bg-(--color-accent) text-white hover:bg-(--color-accent-hover)'
                    : 'border border-(--color-border) text-(--color-text-secondary) hover:bg-(--color-bg)'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
