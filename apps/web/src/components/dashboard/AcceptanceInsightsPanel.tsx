'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Bell, Eye, Mail, AlertTriangle } from 'lucide-react';
import { getAcceptanceInsights, resendOffer, type AcceptanceInsights } from '@/lib/offers-api';
import { cn } from '@/lib/cn';

// ─── AcceptanceInsightsPanel ──────────────────────────────────────────────────
// Lightweight deal-closing assistant: surfaces the 5 actionable insights
// derived from the DealEvent log. Self-fetches on mount.

export function AcceptanceInsightsPanel() {
  const [data, setData] = useState<AcceptanceInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAcceptanceInsights()
      .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function sendReminder(dealId: string) {
    setSendingReminder(dealId);
    try {
      await resendOffer(dealId);
    } finally {
      setSendingReminder(null);
    }
  }

  if (loading) return <Skeleton />;
  if (!data) return null;

  const hasAnyAlert =
    data.openedNotAccepted.length > 0 ||
    data.unopened.length > 0 ||
    data.stalled.length > 0;

  const hasAnyInsight =
    data.medianAcceptanceHours !== null ||
    data.reminderRate !== null ||
    hasAnyAlert;

  if (!hasAnyInsight) return null;

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      aria-label="Acceptance insights"
    >
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Acceptance insights</h3>
      </div>

      <div className="divide-y divide-gray-50">
        {/* ── Insight 1: Median acceptance time ─────────────────────────────── */}
        {data.medianAcceptanceHours !== null && (
          <InsightRow icon={<Clock className="w-4 h-4 text-blue-500" />} color="blue">
            Most agreements are accepted within{' '}
            <strong>{formatHours(data.medianAcceptanceHours)}</strong>.
          </InsightRow>
        )}

        {/* ── Insight 2: Reminder effectiveness ────────────────────────────── */}
        {data.reminderRate !== null && (
          <InsightRow icon={<Bell className="w-4 h-4 text-purple-500" />} color="purple">
            <strong>{data.reminderRate}%</strong> of agreements required a reminder before
            confirmation.
          </InsightRow>
        )}

        {/* ── Insight 3: Opened but not accepted ───────────────────────────── */}
        {data.openedNotAccepted.length > 0 && (
          <InsightRow
            icon={<Eye className="w-4 h-4 text-amber-500" />}
            color="amber"
            action={
              <DealList
                deals={data.openedNotAccepted}
                actionLabel="Send reminder"
                onAction={sendReminder}
                loadingId={sendingReminder}
                hourKey="hoursSinceLastEvent"
              />
            }
          >
            <strong>{data.openedNotAccepted.length}</strong>{' '}
            {data.openedNotAccepted.length === 1 ? 'agreement was' : 'agreements were'} opened but
            not confirmed.
          </InsightRow>
        )}

        {/* ── Insight 4: Unopened deals ─────────────────────────────────────── */}
        {data.unopened.length > 0 && (
          <InsightRow
            icon={<Mail className="w-4 h-4 text-orange-500" />}
            color="orange"
            action={
              <DealList
                deals={data.unopened}
                actionLabel="Follow up"
                onAction={sendReminder}
                loadingId={sendingReminder}
                hourKey="hoursSinceSent"
              />
            }
          >
            <strong>{data.unopened.length}</strong>{' '}
            {data.unopened.length === 1 ? 'agreement has' : 'agreements have'} not been opened yet.
          </InsightRow>
        )}

        {/* ── Insight 5: Stalled deals ──────────────────────────────────────── */}
        {data.stalled.length > 0 && (
          <InsightRow
            icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
            color="red"
            action={
              <DealList
                deals={data.stalled}
                actionLabel="Send reminder"
                onAction={sendReminder}
                loadingId={sendingReminder}
                hourKey="hoursSinceLastEvent"
              />
            }
          >
            <strong>{data.stalled.length}</strong>{' '}
            {data.stalled.length === 1 ? 'agreement appears' : 'agreements appear'} stalled.
          </InsightRow>
        )}
      </div>
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const COLOR_CLASSES = {
  blue:   'bg-blue-50',
  purple: 'bg-purple-50',
  amber:  'bg-amber-50',
  orange: 'bg-orange-50',
  red:    'bg-red-50',
} as const;

function InsightRow({
  icon,
  color,
  children,
  action,
}: {
  icon: React.ReactNode;
  color: keyof typeof COLOR_CLASSES;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', COLOR_CLASSES[color])}>
          {icon}
        </div>
        <p className="text-sm text-gray-700 leading-snug pt-1">{children}</p>
      </div>
      {action}
    </div>
  );
}

interface DealListProps {
  deals: Array<{ dealId: string; dealTitle: string; hoursSinceLastEvent?: number; hoursSinceSent?: number }>;
  actionLabel: string;
  onAction: (dealId: string) => void;
  loadingId: string | null;
  hourKey: 'hoursSinceLastEvent' | 'hoursSinceSent';
}

function DealList({ deals, actionLabel, onAction, loadingId, hourKey }: DealListProps) {
  // Show max 3 deals inline; link to full list
  const visible = deals.slice(0, 3);
  const overflow = deals.length - visible.length;

  return (
    <div className="ml-10 space-y-1.5">
      {visible.map((deal) => {
        const hours = deal[hourKey];
        return (
          <div key={deal.dealId} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/dashboard/offers/${deal.dealId}`}
                className="text-xs font-medium text-gray-800 hover:text-blue-600 transition-colors truncate block max-w-[180px]"
              >
                {deal.dealTitle}
              </Link>
              {hours !== undefined && (
                <span className="text-[10px] text-gray-400">{formatHours(hours)} ago</span>
              )}
            </div>
            <button
              onClick={() => onAction(deal.dealId)}
              disabled={loadingId === deal.dealId}
              className={cn(
                'text-[10px] font-semibold px-2 py-1 rounded-md shrink-0 transition-colors',
                'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {loadingId === deal.dealId ? '…' : actionLabel}
            </button>
          </div>
        );
      })}
      {overflow > 0 && (
        <Link
          href="/dashboard/offers"
          className="text-[10px] text-blue-600 hover:underline"
        >
          +{overflow} more →
        </Link>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-3 animate-pulse">
      <div className="h-4 w-36 bg-gray-100 rounded" />
      <div className="h-3 w-full bg-gray-100 rounded" />
      <div className="h-3 w-4/5 bg-gray-100 rounded" />
      <div className="h-3 w-3/5 bg-gray-100 rounded" />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatHours(hours: number): string {
  if (hours < 1) return 'less than 1 hour';
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
