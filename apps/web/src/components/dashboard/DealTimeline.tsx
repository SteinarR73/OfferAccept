'use client';

import { useEffect, useState } from 'react';
import {
  FilePlus,
  Send,
  Eye,
  ShieldCheck,
  CheckCircle2,
  Award,
  XCircle,
  Clock,
  Ban,
} from 'lucide-react';
import { getDealTimeline, type DealTimelineEvent } from '@/lib/offers-api';
import { Card, CardHeader } from '../ui/Card';
import { cn } from '@/lib/cn';

// ─── DealTimeline ─────────────────────────────────────────────────────────────
// Feature 2: Per-deal lifecycle timeline.
//
// Renders an ordered list of lifecycle events from GET /offers/:id/timeline.
// Each step shows: icon + label + relative/formatted timestamp.
// Pending steps (not yet reached) are shown in muted style.
//
// Events in order:
//   deal_created → deal_sent → deal_opened → otp_verified →
//   deal_accepted → certificate_generated
//   (or deal_declined / deal_expired / deal_revoked as the terminal step)

// ─── Event config ─────────────────────────────────────────────────────────────

type EventKey =
  | 'deal_created'
  | 'deal_sent'
  | 'deal_opened'
  | 'otp_verified'
  | 'deal_accepted'
  | 'certificate_generated'
  | 'deal_declined'
  | 'deal_expired'
  | 'deal_revoked';

const EVENT_CONFIG: Record<EventKey, {
  Icon: React.ElementType;
  dotClass: string;
  iconClass: string;
}> = {
  deal_created:          { Icon: FilePlus,     dotClass: 'bg-gray-400',    iconClass: 'text-gray-400'   },
  deal_sent:             { Icon: Send,          dotClass: 'bg-blue-500',    iconClass: 'text-blue-500'   },
  deal_opened:           { Icon: Eye,           dotClass: 'bg-indigo-400',  iconClass: 'text-indigo-400' },
  otp_verified:          { Icon: ShieldCheck,   dotClass: 'bg-violet-500',  iconClass: 'text-violet-500' },
  deal_accepted:         { Icon: CheckCircle2,  dotClass: 'bg-green-500',   iconClass: 'text-green-500'  },
  certificate_generated: { Icon: Award,         dotClass: 'bg-emerald-500', iconClass: 'text-emerald-500'},
  deal_declined:         { Icon: XCircle,       dotClass: 'bg-red-500',     iconClass: 'text-red-400'    },
  deal_expired:          { Icon: Clock,         dotClass: 'bg-amber-400',   iconClass: 'text-amber-400'  },
  deal_revoked:          { Icon: Ban,           dotClass: 'bg-gray-400',    iconClass: 'text-gray-400'   },
};

const PENDING_CONFIG = {
  dotClass:  'bg-gray-200 border-2 border-gray-300',
  iconClass: 'text-gray-300',
};

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── DealTimeline ─────────────────────────────────────────────────────────────

interface DealTimelineProps {
  offerId: string;
}

export function DealTimeline({ offerId }: DealTimelineProps) {
  const [events, setEvents] = useState<DealTimelineEvent[] | null>(null);

  useEffect(() => {
    getDealTimeline(offerId)
      .then(setEvents)
      .catch(() => { /* best-effort — hide on failure */ });
  }, [offerId]);

  if (!events || events.length === 0) return null;

  return (
    <Card className="h-fit">
      <CardHeader title="Deal timeline" border />

      <ol
        className="px-5 py-3 space-y-0"
        aria-label="Deal lifecycle timeline"
      >
        {events.map((evt, i) => {
          const key = evt.event as EventKey;
          const cfg = evt.pending
            ? { ...PENDING_CONFIG, Icon: (EVENT_CONFIG[key] ?? EVENT_CONFIG.deal_created).Icon }
            : { ...(EVENT_CONFIG[key] ?? EVENT_CONFIG.deal_created) };

          const isLast = i === events.length - 1;

          return (
            <li key={evt.event} className="relative flex gap-3">
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className="absolute left-[6.5px] top-5 bottom-0 w-px bg-gray-100"
                  aria-hidden="true"
                />
              )}

              {/* Dot */}
              <div className="flex-shrink-0 mt-0.5 relative z-10">
                <span
                  className={cn(
                    'flex items-center justify-center w-3.5 h-3.5 rounded-full',
                    evt.pending ? PENDING_CONFIG.dotClass : (EVENT_CONFIG[key] ?? EVENT_CONFIG.deal_created).dotClass,
                  )}
                  aria-hidden="true"
                >
                  <cfg.Icon className={cn('w-2 h-2', cfg.iconClass)} aria-hidden="true" />
                </span>
              </div>

              {/* Content */}
              <div className={cn('flex-1 pb-3.5', isLast && 'pb-1')}>
                <p className={cn(
                  'text-xs font-medium leading-snug',
                  evt.pending ? 'text-gray-300' : 'text-gray-800',
                )}>
                  {evt.label}
                </p>
                {evt.timestamp ? (
                  <p className="text-[11px] text-[--color-text-muted] mt-0.5">
                    {formatTimestamp(evt.timestamp)}
                  </p>
                ) : evt.pending ? (
                  <p className="text-[11px] text-gray-300 mt-0.5">Pending</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function DealTimelineSkeleton() {
  return (
    <Card className="h-fit">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="skeleton h-3 w-24 rounded bg-gray-200" />
      </div>
      <div className="px-5 py-3 space-y-3.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="skeleton w-3.5 h-3.5 rounded-full bg-gray-200 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="skeleton h-2.5 w-32 rounded bg-gray-200" />
              <div className="skeleton h-2 w-16 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
