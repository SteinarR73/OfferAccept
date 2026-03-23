'use client';

import Link from 'next/link';
import { User, Mail, FileText } from 'lucide-react';
import type { OfferItem } from '@offeraccept/types';
import { Card, CardHeader, CardSection } from '@/components/ui/Card';
import { DealTypeBadge, inferDealType } from '@/components/ui/DealTypeBadge';

// ─── ProposalContextCard ───────────────────────────────────────────────────────
// Surfaces the key deal context above the document list on the deal detail page.
// All data comes from the existing OfferItem — no extra API call.

interface ProposalContextCardProps {
  offer: OfferItem;
}

export function ProposalContextCard({ offer }: ProposalContextCardProps) {
  const dealType = inferDealType(offer.title);
  const hasMessage = !!offer.message?.trim();

  return (
    <Card className="mb-4">
      <CardHeader
        title="Deal overview"
        border
        action={<DealTypeBadge type={dealType} />}
      />
      <CardSection>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Customer */}
          {offer.recipient && (
            <div>
              <p className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider mb-2">
                Customer
              </p>
              <Link
                href={`/dashboard/customers/${encodeURIComponent(offer.recipient.email)}`}
                className="flex items-center gap-2.5 group w-fit"
              >
                <div
                  className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-blue-700 uppercase"
                  aria-hidden="true"
                >
                  {(offer.recipient.name ?? offer.recipient.email).slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                    {offer.recipient.name || offer.recipient.email}
                  </p>
                  {offer.recipient.name && (
                    <p className="text-xs text-[--color-text-muted] flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" aria-hidden="true" />
                      {offer.recipient.email}
                    </p>
                  )}
                </div>
              </Link>
            </div>
          )}

          {/* Documents count */}
          <div>
            <p className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider mb-2">
              Documents
            </p>
            {offer.documents.length > 0 ? (
              <ul className="space-y-1">
                {offer.documents.slice(0, 3).map((doc) => (
                  <li key={doc.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                    <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[180px]">{doc.filename}</span>
                  </li>
                ))}
                {offer.documents.length > 3 && (
                  <li className="text-xs text-[--color-text-muted]">
                    +{offer.documents.length - 3} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <User className="w-3 h-3" aria-hidden="true" />
                No documents attached
              </p>
            )}
          </div>
        </div>

        {/* Deal description / message */}
        {hasMessage && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider mb-1.5">
              Description
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed line-clamp-4">
              {offer.message}
            </p>
          </div>
        )}

        {/* Expiry */}
        {offer.expiresAt && offer.status === 'SENT' && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-[--color-text-muted]">
              Expires{' '}
              <time dateTime={offer.expiresAt} className="font-medium text-gray-700">
                {new Date(offer.expiresAt).toLocaleDateString(undefined, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            </p>
          </div>
        )}
      </CardSection>
    </Card>
  );
}
