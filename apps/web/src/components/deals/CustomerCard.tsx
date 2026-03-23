'use client';

import Link from 'next/link';
import { Mail, ExternalLink, Plus } from 'lucide-react';
import type { OfferItem } from '@offeraccept/types';
import { Card, CardHeader, CardSection } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// ─── CustomerCard ─────────────────────────────────────────────────────────────
// Shows the customer associated with this deal.
// All data from OfferItem.recipient — no extra API call.

interface CustomerCardProps {
  offer: OfferItem;
}

export function CustomerCard({ offer }: CustomerCardProps) {
  const { recipient } = offer;

  if (!recipient) {
    return (
      <Card>
        <CardHeader title="Customer" border />
        <CardSection>
          <p className="text-xs text-[--color-text-muted]">No customer assigned to this deal.</p>
          <Link
            href={`/dashboard/deals/${offer.id}`}
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            Add customer
          </Link>
        </CardSection>
      </Card>
    );
  }

  const initial = (recipient.name ?? recipient.email).slice(0, 1).toUpperCase();
  const displayName = recipient.name || recipient.email;
  const newDealHref = `/dashboard/deals/new?email=${encodeURIComponent(recipient.email)}&name=${encodeURIComponent(recipient.name ?? '')}`;
  const customerHref = `/dashboard/customers/${encodeURIComponent(recipient.email)}`;

  return (
    <Card>
      <CardHeader title="Customer" border />
      <CardSection>
        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-700 uppercase select-none"
            aria-hidden="true"
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
            {recipient.name && (
              <p className="text-xs text-[--color-text-muted] flex items-center gap-1 mt-0.5 truncate">
                <Mail className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {recipient.email}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Link
            href={customerHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
            View customer profile
          </Link>
          <Link
            href={newDealHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            New deal for this customer
          </Link>
        </div>
      </CardSection>
    </Card>
  );
}
