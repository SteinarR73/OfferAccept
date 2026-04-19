'use client';

import type { OfferItem } from '@offeraccept/types';
import { Card, CardHeader, CardSection } from '@/components/ui/Card';

// ─── ProposalContextCard ───────────────────────────────────────────────────────
// Shows the deal message/description and expiry.
// All data from OfferItem — no extra API call.

interface ProposalContextCardProps {
  offer: OfferItem;
}

export function ProposalContextCard({ offer }: ProposalContextCardProps) {
  const hasMessage = !!offer.message?.trim();
  const isSent = offer.status === 'SENT';

  if (!hasMessage && !offer.expiresAt) return null;

  return (
    <Card className="mb-4">
      <CardHeader title="Deal description" border />
      <CardSection>
        {hasMessage && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {offer.message}
          </p>
        )}

        {offer.expiresAt && isSent && (
          <div className={hasMessage ? 'mt-4 pt-4 border-t border-gray-100' : ''}>
            <p className="text-xs text-(--color-text-muted)">
              Expires{' '}
              <time dateTime={offer.expiresAt} className="font-medium text-gray-700">
                {new Date(offer.expiresAt).toLocaleDateString(undefined, {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </time>
            </p>
          </div>
        )}
      </CardSection>
    </Card>
  );
}
