'use client';

import { useEffect, useState } from 'react';
import { Clock, Bell, FileX, RotateCcw } from 'lucide-react';
import { getAnalytics, type AnalyticsOverview } from '@/lib/offers-api';
import { Card, CardHeader } from '../ui/Card';
import { cn } from '@/lib/cn';

// ─── AnalyticsOverview ────────────────────────────────────────────────────────
// Lightweight analytics widget for the dashboard sidebar.
//
// Shows metrics not covered by the existing stats row:
//   - Median acceptance time  (Feature 3: "Most deals accepted within X hours")
//   - Reminder effectiveness  (Feature 4: "X% of accepted deals required a reminder")
//   - Status breakdown        (Feature 5: Expired + Revoked + Declined counts)
//
// Fetches GET /analytics/overview independently so it doesn't block the main
// dashboard render. Hidden while loading or when there's no meaningful data.

// ─── Metric row ───────────────────────────────────────────────────────────────

interface MetricRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'gray';
}

const ACCENT_DOT: Record<NonNullable<MetricRowProps['accent']>, string> = {
  blue:  'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  red:   'bg-red-400',
  gray:  'bg-gray-300',
};

function MetricRow({ icon, label, value, sub, accent = 'blue' }: MetricRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-5">
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', ACCENT_DOT[accent])} aria-hidden="true" />
      <span className="text-gray-500 flex-shrink-0 w-3.5 h-3.5">{icon}</span>
      <span className="flex-1 text-xs text-[--color-text-secondary]">{label}</span>
      <span className="text-xs font-semibold text-gray-900 tabular-nums">{value}</span>
      {sub && <span className="text-[11px] text-[--color-text-muted]">{sub}</span>}
    </div>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatHours(h: number): string {
  if (h < 1)  return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// ─── AnalyticsOverview ────────────────────────────────────────────────────────

export function AnalyticsOverview() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch(() => { /* best-effort — hide on failure */ });
  }, []);

  if (!data) return null;

  // Only render when there's meaningful analytics to show
  const hasTimingData    = data.medianAcceptanceHours !== null;
  const hasReminderData  = data.dealsAccepted >= 3 && data.acceptedWithReminderPct !== null;
  const hasStatusDetails = data.dealsExpired > 0 || data.dealsRevoked > 0 || data.dealsDeclined > 0;

  if (!hasTimingData && !hasReminderData && !hasStatusDetails) return null;

  return (
    <Card className="h-fit animate-fade-in" aria-label="Deal analytics">
      <CardHeader title="Analytics" border />

      <ul className="divide-y divide-gray-50" role="list">

        {/* Feature 3: Median acceptance time */}
        {hasTimingData && (
          <li>
            <MetricRow
              icon={<Clock className="w-3.5 h-3.5" aria-hidden="true" />}
              label="Typical acceptance time"
              value={formatHours(data.medianAcceptanceHours!)}
              sub="median"
              accent="blue"
            />
          </li>
        )}

        {/* Feature 4: Reminder effectiveness */}
        {hasReminderData && (
          <li>
            <MetricRow
              icon={<Bell className="w-3.5 h-3.5" aria-hidden="true" />}
              label="Accepted after a reminder"
              value={`${data.acceptedWithReminderPct}%`}
              sub={`${data.acceptedAfterReminderCount} of ${data.dealsAccepted}`}
              accent={
                data.acceptedWithReminderPct! >= 50 ? 'amber'
                : data.acceptedWithReminderPct! >= 25 ? 'blue'
                : 'green'
              }
            />
          </li>
        )}

        {/* Feature 5: Status breakdown — Expired */}
        {data.dealsExpired > 0 && (
          <li>
            <MetricRow
              icon={<Clock className="w-3.5 h-3.5" aria-hidden="true" />}
              label="Expired without response"
              value={String(data.dealsExpired)}
              accent="amber"
            />
          </li>
        )}

        {/* Feature 5: Status breakdown — Declined */}
        {data.dealsDeclined > 0 && (
          <li>
            <MetricRow
              icon={<FileX className="w-3.5 h-3.5" aria-hidden="true" />}
              label="Declined"
              value={String(data.dealsDeclined)}
              accent="red"
            />
          </li>
        )}

        {/* Feature 5: Status breakdown — Revoked */}
        {data.dealsRevoked > 0 && (
          <li>
            <MetricRow
              icon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
              label="Revoked by sender"
              value={String(data.dealsRevoked)}
              accent="gray"
            />
          </li>
        )}
      </ul>
    </Card>
  );
}
