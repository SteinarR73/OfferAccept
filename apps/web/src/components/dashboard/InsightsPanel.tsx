'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Zap,
} from 'lucide-react';
import type { OfferItem } from '@offeraccept/types';
import { resendOffer } from '@/lib/offers-api';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

type InsightVariant = 'positive' | 'warning' | 'neutral' | 'info';

interface Insight {
  id: string;
  variant: InsightVariant;
  Icon: React.ElementType;
  title: string;
  body: string;
  action?: InsightAction;
}

type InsightAction =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'button'; label: string; offerId: string };

// ─── Insight derivation ────────────────────────────────────────────────────────

function deriveInsights(offers: OfferItem[]): Insight[] {
  if (offers.length === 0) return [];

  const now = Date.now();
  const MS_DAY = 86_400_000;
  const insights: Insight[] = [];

  const sent      = offers.filter((o) => o.status === 'SENT');
  const accepted  = offers.filter((o) => o.status === 'ACCEPTED');
  const declined  = offers.filter((o) => o.status === 'DECLINED');
  const drafts    = offers.filter((o) => o.status === 'DRAFT');
  const terminal  = accepted.length + declined.length;

  // ── 1. Acceptance rate ─────────────────────────────────────────────────────
  if (terminal >= 3) {
    const rate = Math.round((accepted.length / terminal) * 100);
    if (rate >= 70) {
      insights.push({
        id: 'acceptance_rate_strong',
        variant: 'positive',
        Icon: TrendingUp,
        title: `${rate}% acceptance rate`,
        body: `${accepted.length} of ${terminal} decided offers were accepted — well above average.`,
      });
    } else if (rate < 40) {
      insights.push({
        id: 'acceptance_rate_low',
        variant: 'warning',
        Icon: TrendingDown,
        title: `${rate}% acceptance rate`,
        body: `${declined.length} of ${terminal} decided offers were declined. Consider reviewing your offer terms.`,
        action: { kind: 'link', label: 'View all offers', href: '/dashboard/offers?tab=DECLINED' },
      });
    }
  }

  // ── 2. Average acceptance speed ───────────────────────────────────────────
  if (accepted.length >= 2) {
    const avgDays =
      accepted.reduce((sum, o) => {
        // Best proxy: updatedAt (acceptance) – createdAt
        return sum + (new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()) / MS_DAY;
      }, 0) / accepted.length;

    if (avgDays < 1.5) {
      insights.push({
        id: 'fast_acceptance',
        variant: 'positive',
        Icon: Zap,
        title: `Accepted in ${avgDays.toFixed(1)} days on average`,
        body: 'Recipients are responding quickly. Your offers are clear and compelling.',
      });
    } else if (avgDays > 4) {
      insights.push({
        id: 'slow_acceptance',
        variant: 'warning',
        Icon: Clock,
        title: `Avg acceptance time: ${avgDays.toFixed(1)} days`,
        body: 'Recipients are taking longer than typical to respond. A follow-up may help.',
        action: sent.length > 0
          ? { kind: 'link', label: 'View pending', href: '/dashboard/offers?tab=SENT' }
          : undefined,
      });
    } else {
      insights.push({
        id: 'normal_acceptance',
        variant: 'neutral',
        Icon: Clock,
        title: `Avg acceptance time: ${avgDays.toFixed(1)} days`,
        body: 'Response time is within normal range.',
      });
    }
  }

  // ── 3. Stalled SENT offers (no update in 7+ days) ────────────────────────
  const stalled = sent.filter(
    (o) => now - new Date(o.updatedAt).getTime() > 7 * MS_DAY,
  );
  if (stalled.length > 0) {
    insights.push({
      id: 'stalled_offers',
      variant: 'warning',
      Icon: AlertCircle,
      title: `${stalled.length} offer${stalled.length > 1 ? 's' : ''} with no activity for 7+ days`,
      body: `${stalled.length === 1 ? 'This offer has' : 'These offers have'} had no response. Sending a reminder may re-engage the recipient.`,
      action: {
        kind: 'button',
        label: `Remind ${stalled.length === 1 ? 'recipient' : `${stalled.length} recipients`}`,
        offerId: stalled[0].id,
      },
    });
  }

  // ── 4. Certified / completed offers ──────────────────────────────────────
  if (accepted.length >= 1 && accepted.length <= 5) {
    insights.push({
      id: 'certificates_ready',
      variant: 'positive',
      Icon: CheckCircle2,
      title: `${accepted.length} verified acceptance certificate${accepted.length > 1 ? 's' : ''}`,
      body: `Each accepted offer generated a tamper-proof certificate with audit trail.`,
      action: {
        kind: 'link',
        label: 'View accepted',
        href: '/dashboard/offers?tab=ACCEPTED',
      },
    });
  }

  // ── 5. Drafts without recipients ─────────────────────────────────────────
  const incompleteDrafts = drafts.filter((o) => !o.recipient);
  if (incompleteDrafts.length >= 2) {
    insights.push({
      id: 'incomplete_drafts',
      variant: 'info',
      Icon: FileText,
      title: `${incompleteDrafts.length} draft${incompleteDrafts.length > 1 ? 's' : ''} without recipients`,
      body: 'These drafts are ready to complete. Add a recipient to each to send.',
      action: {
        kind: 'link',
        label: 'View drafts',
        href: '/dashboard/offers?tab=DRAFT',
      },
    });
  }

  // Max 3 most relevant insights
  return insights.slice(0, 3);
}

// ─── Variant styles ────────────────────────────────────────────────────────────

const VARIANT: Record<InsightVariant, { bar: string; icon: string; bg: string }> = {
  positive: { bar: 'bg-green-500',  icon: 'text-green-600',  bg: 'bg-green-50/60' },
  warning:  { bar: 'bg-amber-400',  icon: 'text-amber-600',  bg: 'bg-amber-50/60' },
  neutral:  { bar: 'bg-gray-300',   icon: 'text-gray-500',   bg: 'bg-gray-50/60'  },
  info:     { bar: 'bg-blue-400',   icon: 'text-blue-600',   bg: 'bg-blue-50/60'  },
};

// ─── InsightsPanel ─────────────────────────────────────────────────────────────

interface InsightsPanelProps {
  offers: OfferItem[];
  loading?: boolean;
}

export function InsightsPanel({ offers, loading }: InsightsPanelProps) {
  const { error: toastError, success: toastSuccess } = useToast();
  const insights = useMemo(() => deriveInsights(offers), [offers]);

  if (loading) return <InsightsPanelSkeleton />;
  if (insights.length === 0) return null;

  async function handleRemind(offerId: string) {
    try {
      await resendOffer(offerId);
      toastSuccess('Reminder sent successfully.');
    } catch {
      toastError('Failed to send reminder. Please try again.');
    }
  }

  return (
    <section aria-labelledby="insights-heading" className="flex flex-col gap-2 animate-fade-in">
      <h3
        id="insights-heading"
        className="text-xs font-semibold uppercase tracking-wider text-[--color-text-muted] px-0.5"
      >
        Insights
      </h3>

      {insights.map((insight, i) => {
        const v = VARIANT[insight.variant];
        return (
          <article
            key={insight.id}
            className={cn(
              'relative rounded-xl border border-gray-200 overflow-hidden',
              'animate-fade-in card-hover',
              v.bg,
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {/* Left accent bar */}
            <div className={cn('absolute left-0 inset-y-0 w-0.5', v.bar)} aria-hidden="true" />

            <div className="pl-4 pr-4 py-3.5 flex gap-3">
              {/* Icon */}
              <insight.Icon
                className={cn('w-4 h-4 mt-0.5 flex-shrink-0', v.icon)}
                aria-hidden="true"
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-snug">{insight.title}</p>
                <p className="text-xs text-[--color-text-secondary] mt-0.5 leading-relaxed">
                  {insight.body}
                </p>

                {insight.action && (
                  <div className="mt-2">
                    {insight.action.kind === 'link' ? (
                      <Link
                        href={insight.action.href}
                        className={cn(
                          'inline-flex items-center text-xs font-medium rounded',
                          'text-[--color-accent] hover:underline',
                          'focus-visible:ring-2 focus-visible:ring-blue-500',
                        )}
                      >
                        {insight.action.label} →
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleRemind((insight.action as { kind: 'button'; label: string; offerId: string }).offerId)}
                        className={cn(
                          'inline-flex items-center text-xs font-medium rounded px-2.5 py-1',
                          'bg-white border border-gray-200 text-gray-700',
                          'hover:bg-gray-50 transition-colors btn-lift',
                          'focus-visible:ring-2 focus-visible:ring-blue-500',
                        )}
                      >
                        {insight.action.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

export function InsightsPanelSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div className="skeleton-shimmer h-3 w-16 rounded mb-1" />
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 p-3.5 flex gap-3 bg-gray-50/60">
          <div className="skeleton-shimmer w-4 h-4 rounded mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton-shimmer h-3.5 w-36 rounded" />
            <div className="skeleton-shimmer h-3 w-full rounded" />
            <div className="skeleton-shimmer h-3 w-4/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
