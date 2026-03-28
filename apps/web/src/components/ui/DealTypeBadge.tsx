'use client';

import { cn } from '@/lib/cn';

// ─── Deal type ─────────────────────────────────────────────────────────────────
// This is a UI-only concept — the backend stores everything as "Offer".
// Deal type is inferred from offer title keywords, falling back to "offer".

export type DealType = 'proposal' | 'quote' | 'offer' | 'onboarding';

const DEAL_TYPE_META: Record<DealType, { label: string; classes: string }> = {
  proposal:   { label: 'Deal',       classes: 'bg-blue-100   text-blue-700'   },
  quote:      { label: 'Quote',      classes: 'bg-purple-100 text-purple-700' },
  offer:      { label: 'Deal',       classes: 'bg-gray-100   text-gray-600'   },
  onboarding: { label: 'Onboarding', classes: 'bg-green-100  text-green-700'  },
};

// Infer deal type from offer title keywords (UI heuristic — no backend call)
export function inferDealType(title: string): DealType {
  const t = title.toLowerCase();
  if (t.includes('proposal'))   return 'proposal';
  if (t.includes('quote'))      return 'quote';
  if (t.includes('onboarding')) return 'onboarding';
  return 'offer';
}

// ─── DealTypeBadge ─────────────────────────────────────────────────────────────

interface DealTypeBadgeProps {
  type?: DealType;
  title?: string;   // if type omitted, infer from title
  className?: string;
}

export function DealTypeBadge({ type, title = '', className }: DealTypeBadgeProps) {
  const resolved = type ?? inferDealType(title);
  const meta = DEAL_TYPE_META[resolved];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        meta.classes,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
