'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Zap, Check } from 'lucide-react';
import {
  getBillingSubscription,
  getBillingCheckout,
  getBillingPortal,
  type BillingSubscription,
  type SubscriptionPlan,
  PLAN_LIMITS,
} from '../../../lib/offers-api';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader, CardSection, CardFooter } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge, PlanBadge } from '../../../components/ui/Badge';
import { Alert } from '../../../components/ui/Alert';
import { cn } from '../../../lib/cn';

// ─── Plan meta ─────────────────────────────────────────────────────────────────

const PLAN_META: Record<SubscriptionPlan, { label: string; price: string; features: string[] }> = {
  FREE: {
    label: 'Free',
    price: '$0/mo',
    features: ['3 deals / month', 'PDF & DOCX documents', 'Acceptance certificates', 'Email support'],
  },
  STARTER: {
    label: 'Starter',
    price: '$29/mo',
    features: ['25 deals / month', 'All Free features', 'Custom expiry dates', 'Priority email support'],
  },
  PROFESSIONAL: {
    label: 'Professional',
    price: '$79/mo',
    features: ['100 deals / month', 'All Starter features', 'API access', 'Webhooks', 'Priority support'],
  },
  ENTERPRISE: {
    label: 'Enterprise',
    price: 'Custom',
    features: ['Unlimited deals', 'All Professional features', 'SLA guarantee', 'Dedicated support', 'Custom onboarding'],
  },
};

const PLAN_ORDER: SubscriptionPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

// ─── BillingPage ──────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [sub, setSub] = useState<BillingSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<SubscriptionPlan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBillingSubscription()
      .then(setSub)
      .catch(() => setError('Could not load billing information.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(plan: SubscriptionPlan) {
    if (plan === 'ENTERPRISE') return; // handled by contact sales link
    setCheckoutLoading(plan);
    try {
      const { url } = await getBillingCheckout(plan);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Could not open checkout. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const { url } = await getBillingPortal();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Could not open billing portal. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  }

  const limit = sub ? PLAN_LIMITS[sub.plan] : null;
  const usagePct = sub && limit ? Math.min(100, Math.round((sub.monthlyOfferCount / limit) * 100)) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Billing"
        description="Manage your plan and payment details."
      />

      {error && <Alert variant="error" dismissible className="mb-4">{error}</Alert>}

      {/* ── Current plan ──────────────────────────────────────────────────── */}
      {loading ? (
        <Card className="mb-6">
          <div className="p-5 space-y-3">
            <div className="skeleton-shimmer h-4 w-32 rounded bg-[--color-surface]" />
            <div className="skeleton-shimmer h-3 w-48 rounded bg-[--color-bg]" />
            <div className="skeleton-shimmer h-2 w-full rounded bg-[--color-bg]" />
          </div>
        </Card>
      ) : sub && (
        <Card className="mb-6">
          <CardHeader
            title="Current plan"
            action={
              <div className="flex items-center gap-2">
                <PlanBadge plan={sub.plan} />
                <Badge variant={sub.status === 'ACTIVE' || sub.status === 'TRIALING' ? 'green' : sub.status === 'PAST_DUE' ? 'amber' : 'red'}>
                  {sub.status.replace('_', ' ')}
                </Badge>
              </div>
            }
            border
          />
          <CardSection>
            {sub.cancelAtPeriodEnd && (
              <Alert variant="warning" className="mb-4">
                Your subscription will be cancelled at the end of the current period.
              </Alert>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[--color-text-secondary]">Deals this month</span>
                <span className="font-semibold text-[--color-text-primary]">
                  {sub.monthlyOfferCount} / {limit ?? '∞'}
                </span>
              </div>
              {limit && (
                <div
                  role="progressbar"
                  aria-valuenow={usagePct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${usagePct}% of monthly deal limit used`}
                  className="h-2 bg-[--color-surface] rounded-full overflow-hidden"
                >
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', usagePct >= 90 ? 'bg-[--color-error]' : usagePct >= 70 ? 'bg-[--color-warning]' : 'bg-[--color-accent]')}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              )}
              {sub.currentPeriodEnd && (
                <p className="text-xs text-[--color-text-muted]">
                  Resets on {new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </CardSection>
          {(sub.status === 'ACTIVE' || sub.status === 'TRIALING') && sub.plan !== 'FREE' && (
            <CardFooter>
              <Button variant="secondary" size="sm" loading={portalLoading} onClick={handlePortal}
                rightIcon={<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />}>
                Manage subscription
              </Button>
            </CardFooter>
          )}
        </Card>
      )}

      {/* ── Plan comparison ────────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-[--color-text-primary] mb-3">Available plans</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLAN_ORDER.map((plan) => {
          const meta = PLAN_META[plan];
          const isCurrent = sub?.plan === plan;
          const isDowngrade = sub && PLAN_ORDER.indexOf(plan) < PLAN_ORDER.indexOf(sub.plan);

          return (
            <div
              key={plan}
              className={cn(
                'flex flex-col rounded-xl border p-5 bg-white transition-shadow',
                isCurrent ? 'border-[--color-accent] ring-1 ring-[--color-accent] shadow-md' : 'border-[--color-border] hover:shadow-sm',
              )}
            >
              <div className="mb-4">
                <PlanBadge plan={plan} />
                <p className="mt-2 text-2xl font-bold text-[--color-text-primary]">{meta.price}</p>
              </div>
              <ul className="flex-1 space-y-2 mb-5">
                {meta.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[--color-text-secondary]">
                    <Check className="w-3.5 h-3.5 text-[--color-success] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="text-xs text-center text-[--color-accent-text] font-semibold py-1.5">Current plan</span>
              ) : plan === 'ENTERPRISE' ? (
                <a
                  href="mailto:sales@offeraccept.com"
                  className="text-xs text-center text-[--color-accent] hover:text-[--color-accent-hover] font-medium py-1.5 transition-colors"
                >
                  Contact sales →
                </a>
              ) : (
                <Button
                  variant={isDowngrade ? 'secondary' : 'primary'}
                  size="sm"
                  className="w-full"
                  loading={checkoutLoading === plan}
                  onClick={() => handleUpgrade(plan)}
                  leftIcon={!isDowngrade ? <Zap className="w-3.5 h-3.5" aria-hidden="true" /> : undefined}
                >
                  {isDowngrade ? 'Downgrade' : 'Upgrade'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
