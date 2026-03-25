'use client';

import { useEffect, useState } from 'react';
import { getDealStatus, type DealStatusResult, type RecommendedAction } from '@/lib/offers-api';

// ─── DealIntelligenceCard ──────────────────────────────────────────────────────
// Displays computed deal status, recipient engagement level, recommended action,
// and human-readable insights derived from the deal's event log.

interface Props {
  offerId: string;
  /** Pass the DB status so we can skip fetching for terminal states that won't have events */
  offerStatus: string;
}

// ── Recipient activity display ─────────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, { label: string; color: string }> = {
  never_opened:    { label: 'Not opened',        color: 'text-gray-500' },
  opened:          { label: 'Opened',             color: 'text-blue-600' },
  viewed_document: { label: 'Viewed documents',   color: 'text-blue-700' },
  otp_started:     { label: 'Verifying identity', color: 'text-amber-600' },
  otp_verified:    { label: 'Identity verified',  color: 'text-amber-700' },
  accepted:        { label: 'Accepted',           color: 'text-green-700' },
};

// ── Recommended action display ─────────────────────────────────────────────────

const ACTION_CONFIG: Record<RecommendedAction, { label: string; icon: string; classes: string } | null> = {
  SEND_REMINDER:          { label: 'Send a reminder', icon: '🔔', classes: 'bg-amber-50 border-amber-300 text-amber-800' },
  FOLLOW_UP:              { label: 'Follow up with recipient', icon: '💬', classes: 'bg-blue-50 border-blue-300 text-blue-800' },
  CHECK_WITH_RECIPIENT:   { label: 'Check in with recipient — they verified but haven\'t confirmed yet', icon: '⏳', classes: 'bg-purple-50 border-purple-300 text-purple-800' },
  NONE:                   null,
};

// ── Progress bar ───────────────────────────────────────────────────────────────

const ENGAGEMENT_STEPS = [
  { key: 'never_opened',    label: 'Sent' },
  { key: 'opened',          label: 'Opened' },
  { key: 'otp_verified',    label: 'Verified' },
  { key: 'accepted',        label: 'Accepted' },
];

const STEP_RANK: Record<string, number> = {
  never_opened: 0,
  opened: 1,
  viewed_document: 1,
  otp_started: 2,
  otp_verified: 2,
  accepted: 3,
};

function EngagementProgress({ activity }: { activity: string }) {
  const rank = STEP_RANK[activity] ?? 0;
  return (
    <div className="flex items-center gap-1">
      {ENGAGEMENT_STEPS.map((step, idx) => (
        <div key={step.key} className="flex items-center gap-1">
          <div
            className={[
              'w-2 h-2 rounded-full',
              idx <= rank ? 'bg-blue-500' : 'bg-gray-200',
            ].join(' ')}
          />
          <span className={['text-xs', idx <= rank ? 'text-gray-700' : 'text-gray-400'].join(' ')}>
            {step.label}
          </span>
          {idx < ENGAGEMENT_STEPS.length - 1 && (
            <div className={['h-px w-6', idx < rank ? 'bg-blue-400' : 'bg-gray-200'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse">
      <div className="h-4 w-32 bg-gray-100 rounded mb-3" />
      <div className="h-3 w-full bg-gray-100 rounded mb-2" />
      <div className="h-3 w-3/4 bg-gray-100 rounded" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DealIntelligenceCard({ offerId, offerStatus }: Props) {
  const [status, setStatus] = useState<DealStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDealStatus(offerId)
      .then((res) => { if (!cancelled) { setStatus(res); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [offerId]);

  if (loading) return <Skeleton />;
  if (error || !status) return null;

  // Don't show the card at all if there are no events and the deal is a draft
  if (!status.lastEvent && offerStatus === 'DRAFT') return null;

  const activityDisplay = ACTIVITY_LABELS[status.recipientActivity];
  const actionConfig = ACTION_CONFIG[status.recommendedAction];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Deal intelligence</h3>
        {status.lastActivityAt && (
          <span className="text-xs text-gray-400">
            Last activity {formatRelativeTime(status.lastActivityAt)}
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Engagement progress bar */}
        {status.recipientActivity !== 'never_opened' || offerStatus === 'SENT' ? (
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Recipient engagement</p>
            <EngagementProgress activity={status.recipientActivity} />
          </div>
        ) : null}

        {/* Recipient activity level */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Recipient status</span>
          <span className={`font-medium ${activityDisplay?.color ?? 'text-gray-700'}`}>
            {activityDisplay?.label ?? status.recipientActivity}
          </span>
        </div>

        {/* Insights */}
        {status.insights.length > 0 && (
          <div className="space-y-1">
            {status.insights.map((insight, i) => (
              <p key={i} className="text-xs text-gray-600">
                {insight}
              </p>
            ))}
          </div>
        )}

        {/* Recommended action */}
        {actionConfig && (
          <div className={`rounded-lg border px-3 py-2 text-xs font-medium flex items-center gap-2 ${actionConfig.classes}`}>
            <span>{actionConfig.icon}</span>
            <span>{actionConfig.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
