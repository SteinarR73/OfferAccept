'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { getDelivery, type DeliveryAttempt } from '../../lib/offers-api';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';

type OfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

interface Props {
  offerId: string;
  offerStatus: OfferStatus;
}

function outcomeVariant(outcome: string): 'green' | 'red' | 'blue' | 'gray' {
  if (outcome.includes('DELIVERED') || outcome === 'DELIVERED_TO_PROVIDER') return 'green';
  if (outcome === 'FAILED') return 'red';
  if (outcome === 'DISPATCHING') return 'blue';
  return 'gray';
}

function outcomeLabel(outcome: string): string {
  if (outcome === 'DELIVERED_TO_PROVIDER') return 'Delivered';
  if (outcome === 'DISPATCHING') return 'Sending';
  if (outcome === 'FAILED') return 'Failed';
  return outcome;
}

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function DeliveryTimeline({ offerId, offerStatus }: Props) {
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDelivery(offerId)
      .then(setAttempts)
      .catch(() => setAttempts([]))
      .finally(() => setLoading(false));
  }, [offerId]);

  const terminalStatus = offerStatus === 'ACCEPTED' || offerStatus === 'DECLINED';

  return (
    <Card>
      <CardHeader title="Delivery history" border />
      {loading ? (
        <div className="px-5 py-3 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-2 h-2 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-2.5 w-40 rounded bg-gray-200" />
                <div className="skeleton h-2 w-24 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : attempts.length === 0 && !terminalStatus ? (
        <p className="px-5 py-4 text-xs text-[--color-text-muted]">No delivery attempts yet.</p>
      ) : (
        <ol aria-label="Delivery timeline" className="px-5 py-3 space-y-4">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="flex items-start gap-3">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                  outcomeVariant(attempt.outcome) === 'green' ? 'bg-green-500' :
                  outcomeVariant(attempt.outcome) === 'red' ? 'bg-red-500' :
                  'bg-blue-400'
                }`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-900 font-medium">{formatDatetime(attempt.attemptedAt)}</p>
                <p className="text-[11px] text-[--color-text-muted] mt-0.5 truncate">{attempt.recipientEmail}</p>
              </div>
              <Badge variant={outcomeVariant(attempt.outcome)} size="sm">
                {outcomeLabel(attempt.outcome)}
              </Badge>
            </li>
          ))}

          {/* Terminal row: accepted or declined */}
          {offerStatus === 'ACCEPTED' && (
            <li className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-green-700">Offer accepted by recipient</p>
                <p className="text-[11px] text-[--color-text-muted] mt-0.5">Certificate generation initiated</p>
              </div>
            </li>
          )}
          {offerStatus === 'DECLINED' && (
            <li className="flex items-start gap-3">
              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-red-700">Offer declined by recipient</p>
              </div>
            </li>
          )}
          {offerStatus === 'SENT' && (
            <li className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-xs text-[--color-text-muted]">Awaiting recipient action…</p>
              </div>
            </li>
          )}
        </ol>
      )}
    </Card>
  );
}
