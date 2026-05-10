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

// ─── Plan definitions (NOK) ───────────────────────────────────────────────────

const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Gratis',
    monthly: 0,
    yearly: 0,
    deals: '3 dokumenter / måned',
    desc: 'Prøv OfferAccept uten kostnad. Perfekt for sporadisk bruk.',
    features: ['OTP-bekreftet signering', 'PDF-akseptbevis', 'Manipuleringssikker revisjonslogg', 'Ingen konto nødvendig for mottaker'],
    cta: 'Start gratis',
    ctaHref: '/login?mode=signup',
    featured: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    monthly: 179,
    yearly: 149,
    deals: '20 dokumenter / måned',
    desc: 'For frilansere og små bedrifter som erstatter e-postbekreftelser.',
    features: ['Alt i Gratis', 'Eget e-postavsendernavn', 'Dokumenthistorikk og søk', 'Påminnelse til mottaker'],
    cta: 'Kom i gang',
    ctaHref: '/login?mode=signup&plan=starter',
    featured: true,
  },
  {
    id: 'team',
    name: 'Team',
    monthly: 479,
    yearly: 399,
    deals: '75 dokumenter / måned',
    desc: 'For små team som sender tilbud, pristilbud og godkjenninger regelmessig.',
    features: ['Alt i Starter', 'Flerbruker-arbeidsrom', 'Malbibliotek', 'Prioritert e-poststøtte'],
    cta: 'Start Team',
    ctaHref: '/login?mode=signup&plan=team',
    featured: false,
  },
  {
    id: 'business',
    name: 'Business',
    monthly: 1079,
    yearly: 899,
    deals: '250 dokumenter / måned',
    desc: 'For voksende bedrifter som trenger integrasjoner og høyere volum.',
    features: ['Alt i Team', 'REST API og webhooks', 'Zapier-integrasjon', 'Egendefinert merkevare'],
    cta: 'Start Business',
    ctaHref: '/login?mode=signup&plan=business',
    featured: false,
  },
];

// ─── Toggle ───────────────────────────────────────────────────────────────────

function BillingToggle({ cycle, onChange }: { cycle: Cycle; onChange: (c: Cycle) => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5 mb-10">
      <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-widest">
        Anbefalt
      </p>

      <div
        className="inline-flex items-center rounded-xl border border-(--color-border) bg-(--color-bg) p-1 gap-1"
        role="group"
        aria-label="Faktureringsperiode"
      >
        {/* Månedlig — muted, plain */}
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
          Månedlig
        </button>

        {/* Årlig — always prominent, green when active */}
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
          Årlig
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
              cycle === 'yearly'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-200 text-emerald-800'
            }`}
          >
            spar ~17%
          </span>
        </button>
      </div>

      {cycle === 'monthly' && (
        <p className="text-xs text-(--color-text-muted) mt-0.5">
          Bytt til årlig og{' '}
          <button
            type="button"
            onClick={() => onChange('yearly')}
            className="text-emerald-600 font-semibold underline underline-offset-2 hover:text-emerald-700 cursor-pointer"
          >
            spar opptil 180 kr/mnd
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
            Mest populær
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
            <span className="text-3xl font-bold text-(--color-text-primary)">Gratis</span>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-(--color-text-primary)">
                  {price?.toLocaleString('nb-NO')} kr
                </span>
                <span className="text-sm text-(--color-text-muted)">/mnd</span>
              </div>

              <p className="text-xs text-(--color-text-muted) mt-0.5">
                {cycle === 'yearly' ? 'fakturert årlig' : 'fakturert månedlig'}
              </p>

              {cycle === 'yearly' ? (
                <span className="inline-block mt-1.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  Spar 17%
                </span>
              ) : (
                monthlySaving > 0 && (
                  <button
                    type="button"
                    onClick={onSwitchToYearly}
                    className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer group"
                    title="Bytt til årlig fakturering"
                  >
                    <span className="group-hover:underline underline-offset-2">
                      Spar {monthlySaving.toLocaleString('nb-NO')} kr/mnd med årlig
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

// ─── NoPricingPlansClient ─────────────────────────────────────────────────────

export function NoPricingPlansClient() {
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
