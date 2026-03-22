'use client';

import Link from 'next/link';
import { AlertTriangle, Clock, Send } from 'lucide-react';
import type { OfferItem } from '@offeraccept/types';
import { Card, CardHeader } from '../ui/Card';
import { cn } from '@/lib/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ActionType = 'awaiting_acceptance' | 'expiring_soon' | 'draft_needs_send';

interface ActionItem {
  type: ActionType;
  offerId: string;
  title: string;
  detail: string;
  href: string;
}

// ─── Derive actions from already-fetched offer list ───────────────────────────

function deriveActions(offers: OfferItem[]): ActionItem[] {
  const now = Date.now();
  const MS_3_DAYS = 3 * 24 * 60 * 60 * 1000;
  const MS_48H = 48 * 60 * 60 * 1000;
  const items: ActionItem[] = [];

  for (const offer of offers) {
    if (offer.status === 'SENT') {
      // Awaiting acceptance: sent more than 3 days ago
      if (now - new Date(offer.updatedAt).getTime() > MS_3_DAYS) {
        const daysSince = Math.floor((now - new Date(offer.updatedAt).getTime()) / 86400000);
        items.push({
          type: 'awaiting_acceptance',
          offerId: offer.id,
          title: offer.title,
          detail: `Waiting ${daysSince} day${daysSince !== 1 ? 's' : ''} for acceptance`,
          href: `/dashboard/offers/${offer.id}`,
        });
      }
      // Expiring soon: expiresAt within 48 hours
      if (offer.expiresAt && new Date(offer.expiresAt).getTime() - now < MS_48H && new Date(offer.expiresAt).getTime() > now) {
        items.push({
          type: 'expiring_soon',
          offerId: offer.id + '_exp',
          title: offer.title,
          detail: 'Expires within 48 hours',
          href: `/dashboard/offers/${offer.id}`,
        });
      }
    }

    // Draft ready to send (has a recipient set)
    if (offer.status === 'DRAFT' && offer.recipient) {
      items.push({
        type: 'draft_needs_send',
        offerId: offer.id,
        title: offer.title,
        detail: 'Draft ready to send',
        href: `/dashboard/offers/${offer.id}`,
      });
    }
  }

  // Limit to most important 5
  return items.slice(0, 5);
}

// ─── ActionPanel ──────────────────────────────────────────────────────────────

const ICON: Record<ActionType, React.ReactNode> = {
  awaiting_acceptance: <Clock className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />,
  expiring_soon:       <AlertTriangle className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />,
  draft_needs_send:    <Send className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />,
};

const LABEL: Record<ActionType, string> = {
  awaiting_acceptance: 'Awaiting acceptance',
  expiring_soon:       'Expiring soon',
  draft_needs_send:    'Ready to send',
};

interface ActionPanelProps {
  offers: OfferItem[];
  loading?: boolean;
}

export function ActionPanel({ offers, loading }: ActionPanelProps) {
  if (loading) return <ActionPanelSkeleton />;

  const actions = deriveActions(offers);
  if (actions.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-amber-400 mb-6 animate-fade-in">
      <CardHeader
        title="Action required"
        description={`${actions.length} offer${actions.length !== 1 ? 's' : ''} need${actions.length === 1 ? 's' : ''} attention`}
        border
      />
      <ul className="divide-y divide-gray-50">
        {actions.map((item) => (
          <li key={item.offerId}>
            <Link
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors',
                'focus-visible:outline-none focus-visible:bg-blue-50',
              )}
            >
              <span className="flex-shrink-0">{ICON[item.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                <p className="text-xs text-[--color-text-muted]">{item.detail}</p>
              </div>
              <span className="flex-shrink-0 text-xs font-medium text-[--color-text-muted] hidden sm:block">
                {LABEL[item.type]}
              </span>
              <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ActionPanelSkeleton() {
  return (
    <Card className="mb-6">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="skeleton h-3 w-32 rounded bg-gray-200 mb-1.5" />
        <div className="skeleton h-2.5 w-48 rounded bg-gray-100" />
      </div>
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
          <div className="skeleton w-3.5 h-3.5 rounded bg-gray-200" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-40 rounded bg-gray-200" />
            <div className="skeleton h-2.5 w-28 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </Card>
  );
}
