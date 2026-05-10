export type Locale = 'no' | 'en';
export type Cycle = 'monthly' | 'yearly';

export interface PlanPricing {
  monthly: number;
  yearly: number;
  currency: string;
  currencySymbol: string;
}

export interface PlanConfig {
  id: string;
  deals: number | null;
  pricing: Record<Locale, PlanPricing>;
}

export const PLANS_CONFIG: PlanConfig[] = [
  {
    id: 'free',
    deals: 3,
    pricing: {
      no: { monthly: 0, yearly: 0, currency: 'NOK', currencySymbol: 'NOK' },
      en: { monthly: 0, yearly: 0, currency: 'USD', currencySymbol: '$' },
    },
  },
  {
    id: 'starter',
    deals: 20,
    pricing: {
      no: { monthly: 199, yearly: 149, currency: 'NOK', currencySymbol: 'NOK' },
      en: { monthly: 19, yearly: 15, currency: 'USD', currencySymbol: '$' },
    },
  },
  {
    id: 'team',
    deals: 75,
    pricing: {
      no: { monthly: 499, yearly: 399, currency: 'NOK', currencySymbol: 'NOK' },
      en: { monthly: 49, yearly: 39, currency: 'USD', currencySymbol: '$' },
    },
  },
  {
    id: 'business',
    deals: 250,
    pricing: {
      no: { monthly: 1099, yearly: 899, currency: 'NOK', currencySymbol: 'NOK' },
      en: { monthly: 99, yearly: 79, currency: 'USD', currencySymbol: '$' },
    },
  },
];

export function formatPrice(amount: number, locale: Locale): string {
  if (locale === 'no') {
    return `${amount.toLocaleString('nb-NO')} NOK`;
  }
  return `$${amount}`;
}

export function getPlanPricing(planId: string, locale: Locale): PlanPricing | null {
  const plan = PLANS_CONFIG.find((p) => p.id === planId);
  return plan ? plan.pricing[locale] : null;
}
