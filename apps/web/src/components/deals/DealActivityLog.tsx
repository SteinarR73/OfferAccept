'use client';

import { FileText, Send, CheckCircle2, XCircle, RotateCcw, Clock } from 'lucide-react';
import type { OfferItem, OfferStatusValue } from '@offeraccept/types';
import { Card, CardHeader } from '@/components/ui/Card';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type EventVariant = 'neutral' | 'blue' | 'green' | 'red' | 'amber' | 'purple';

interface DealEvent {
  id: string;
  label: string;
  timestamp: string;
  variant: EventVariant;
  icon: React.ReactNode;
}

const ICON_SIZE = 'w-3.5 h-3.5';

function deriveEvents(offer: OfferItem): DealEvent[] {
  const events: DealEvent[] = [
    {
      id: 'created',
      label: 'Deal created',
      timestamp: offer.createdAt,
      variant: 'neutral',
      icon: <FileText className={ICON_SIZE} aria-hidden="true" />,
    },
  ];

  const status = offer.status as OfferStatusValue;

  // SENT or beyond — deal was sent
  if (status !== 'DRAFT') {
    events.push({
      id: 'sent',
      label: offer.recipient?.email
        ? `Sent to ${offer.recipient.email}`
        : 'Sent to customer',
      timestamp: offer.updatedAt,
      variant: 'blue',
      icon: <Send className={ICON_SIZE} aria-hidden="true" />,
    });
  }

  // Terminal events
  if (status === 'ACCEPTED') {
    events.push({
      id: 'accepted',
      label: 'Deal accepted — certificate issued',
      timestamp: offer.updatedAt,
      variant: 'green',
      icon: <CheckCircle2 className={ICON_SIZE} aria-hidden="true" />,
    });
  }

  if (status === 'DECLINED') {
    events.push({
      id: 'declined',
      label: 'Customer declined the deal',
      timestamp: offer.updatedAt,
      variant: 'red',
      icon: <XCircle className={ICON_SIZE} aria-hidden="true" />,
    });
  }

  if (status === 'REVOKED') {
    events.push({
      id: 'revoked',
      label: 'Deal revoked',
      timestamp: offer.updatedAt,
      variant: 'purple',
      icon: <RotateCcw className={ICON_SIZE} aria-hidden="true" />,
    });
  }

  if (status === 'EXPIRED') {
    events.push({
      id: 'expired',
      label: 'Deal expired without acceptance',
      timestamp: offer.expiresAt ?? offer.updatedAt,
      variant: 'amber',
      icon: <Clock className={ICON_SIZE} aria-hidden="true" />,
    });
  }

  // Return in chronological order
  return events;
}

const DOT_COLOR: Record<EventVariant, string> = {
  neutral: 'bg-gray-400',
  blue:    'bg-blue-500',
  green:   'bg-green-500',
  red:     'bg-red-500',
  amber:   'bg-amber-400',
  purple:  'bg-purple-500',
};

const ICON_COLOR: Record<EventVariant, string> = {
  neutral: 'text-gray-400',
  blue:    'text-blue-500',
  green:   'text-green-500',
  red:     'text-red-500',
  amber:   'text-amber-500',
  purple:  'text-purple-500',
};

// ─── DealActivityLog ──────────────────────────────────────────────────────────

interface DealActivityLogProps {
  offer: OfferItem;
}

export function DealActivityLog({ offer }: DealActivityLogProps) {
  const events = deriveEvents(offer);

  return (
    <Card>
      <CardHeader title="Activity" border />
      <ol aria-label="Deal activity log" className="px-5 py-4 space-y-4">
        {events.map((event, i) => {
          const isLast = i === events.length - 1;
          return (
            <li key={event.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-50 border border-gray-100 ${ICON_COLOR[event.variant]}`}
                >
                  {event.icon}
                </div>
                {!isLast && (
                  <div className="w-px flex-1 min-h-[16px] mt-1 mb-1 bg-gray-100" aria-hidden="true" />
                )}
              </div>
              <div className={isLast ? '' : 'pb-1'}>
                <p className="text-xs font-medium text-gray-900">{event.label}</p>
                <time
                  dateTime={event.timestamp}
                  className="text-[11px] text-[--color-text-muted] mt-0.5 block"
                >
                  {formatDatetime(event.timestamp)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
