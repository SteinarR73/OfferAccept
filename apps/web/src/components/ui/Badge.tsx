import { cn } from '@/lib/cn';

const VARIANT = {
  gray:   'bg-(--color-neutral-surface) text-(--color-neutral-text)',
  blue:   'bg-(--color-info-light) text-(--color-info-text)',
  green:  'bg-(--color-success-light) text-(--color-success-text)',
  red:    'bg-(--color-error-light) text-(--color-error-text)',
  amber:  'bg-(--color-warning-light) text-(--color-warning-text)',
  purple: 'bg-(--color-purple-surface) text-(--color-purple-text)',
} as const;

const DOT = {
  gray:   'bg-(--color-neutral-text)',
  blue:   'bg-(--color-info)',
  green:  'bg-(--color-success)',
  red:    'bg-(--color-error)',
  amber:  'bg-(--color-warning)',
  purple: 'bg-(--color-purple)',
} as const;

const SIZE = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
} as const;

interface BadgeProps {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = 'gray', size = 'sm', dot = false, className, children }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full font-semibold', VARIANT[variant], SIZE[size], className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', DOT[variant])} aria-hidden="true" />}
      {children}
    </span>
  );
}

// ── Pre-wired status badges ───────────────────────────────────────────────────

type OfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

const OFFER_VARIANT: Record<OfferStatus, keyof typeof VARIANT> = {
  DRAFT:    'gray',
  SENT:     'blue',
  ACCEPTED: 'green',
  DECLINED: 'red',
  EXPIRED:  'amber',
  REVOKED:  'purple',
};

const OFFER_LABEL: Record<OfferStatus, string> = {
  DRAFT:    'Draft',
  SENT:     'Sent',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED:  'Expired',
  REVOKED:  'Revoked',
};

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return (
    <Badge variant={OFFER_VARIANT[status]} dot>
      {OFFER_LABEL[status]}
    </Badge>
  );
}

// ── Plan badge ────────────────────────────────────────────────────────────────

type Plan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

const PLAN_VARIANT: Record<Plan, keyof typeof VARIANT> = {
  FREE:         'gray',
  STARTER:      'blue',
  PROFESSIONAL: 'purple',
  ENTERPRISE:   'amber',
};

export function PlanBadge({ plan }: { plan: Plan }) {
  return <Badge variant={PLAN_VARIANT[plan]}>{plan}</Badge>;
}
