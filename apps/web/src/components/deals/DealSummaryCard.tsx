'use client';

import { useState } from 'react';
import { Send, RotateCcw, XCircle, Calendar, Tag } from 'lucide-react';
import type { OfferItem, OfferStatusValue } from '@offeraccept/types';
import { Card, CardHeader, CardSection, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { OfferStatusBadge } from '@/components/ui/Badge';
import { DealTypeBadge, inferDealType } from '@/components/ui/DealTypeBadge';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OfferItemExtended extends OfferItem {
  certificateId?: string;
}

interface DealSummaryCardProps {
  offer: OfferItemExtended;
  onSend: () => Promise<void>;
  onRevoke: () => Promise<void>;
  onResend: () => Promise<void>;
}

// ─── DealSummaryCard ───────────────────────────────────────────────────────────

export function DealSummaryCard({ offer, onSend, onRevoke, onResend }: DealSummaryCardProps) {
  const dealType = inferDealType(offer.title);

  return (
    <Card>
      <CardHeader title="Deal summary" border />
      <CardSection>
        <dl className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider mt-0.5">
              Status
            </dt>
            <dd><OfferStatusBadge status={offer.status} /></dd>
          </div>

          <div className="flex items-start justify-between gap-4">
            <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider mt-0.5">
              Type
            </dt>
            <dd><DealTypeBadge type={dealType} /></dd>
          </div>

          <div className="flex items-start justify-between gap-4">
            <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" aria-hidden="true" />
              Created
            </dt>
            <dd className="text-xs text-gray-700">
              <time dateTime={offer.createdAt}>
                {new Date(offer.createdAt).toLocaleDateString(undefined, {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </time>
            </dd>
          </div>

          {offer.expiresAt && (
            <div className="flex items-start justify-between gap-4">
              <dt className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider flex items-center gap-1 mt-0.5">
                <Tag className="w-3 h-3" aria-hidden="true" />
                Expires
              </dt>
              <dd className="text-xs text-gray-700">
                <time dateTime={offer.expiresAt}>
                  {new Date(offer.expiresAt).toLocaleDateString(undefined, {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </time>
              </dd>
            </div>
          )}
        </dl>
      </CardSection>

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      {(offer.status === 'DRAFT' || offer.status === 'SENT') && (
        <CardFooter>
          <ActionBar offer={offer} onSend={onSend} onRevoke={onRevoke} onResend={onResend} />
        </CardFooter>
      )}
    </Card>
  );
}

// ─── ActionBar ─────────────────────────────────────────────────────────────────

interface ActionBarProps {
  offer: OfferItemExtended;
  onSend: () => Promise<void>;
  onRevoke: () => Promise<void>;
  onResend: () => Promise<void>;
}

function ActionBar({ offer, onSend, onRevoke, onResend }: ActionBarProps) {
  const [loading, setLoading] = useState<'send' | 'revoke' | 'resend' | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: 'send' | 'revoke' | 'resend', fn: () => Promise<void>) {
    setLoading(action);
    setError(null);
    try { await fn(); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Action failed.'); }
    finally { setLoading(null); setConfirmRevoke(false); }
  }

  if (offer.status === 'DRAFT') {
    const canSend = !!offer.recipient?.email;
    return (
      <div className="space-y-2 w-full">
        {error && <Alert variant="error" dismissible>{error}</Alert>}
        {!canSend && (
          <Alert variant="warning" className="text-xs">Add a customer email before sending.</Alert>
        )}
        <div>
          <p className="text-[11px] text-[--color-text-muted] mb-2">
            Draft — not yet sent to customer
          </p>
          <Button
            variant="primary"
            size="sm"
            loading={loading === 'send'}
            disabled={!canSend}
            onClick={() => handle('send', onSend)}
            leftIcon={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Send deal
          </Button>
        </div>
      </div>
    );
  }

  if (offer.status === 'SENT') {
    return (
      <div className="space-y-2 w-full">
        {error && <Alert variant="error" dismissible>{error}</Alert>}
        {confirmRevoke ? (
          <Alert variant="warning">
            <p className="text-xs font-semibold mb-1">Revoke this deal?</p>
            <p className="text-xs mb-2">The deal link will be invalidated immediately.</p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={loading === 'revoke'}
                onClick={() => handle('revoke', onRevoke)}
                leftIcon={<XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Yes, revoke
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmRevoke(false)}>
                Cancel
              </Button>
            </div>
          </Alert>
        ) : (
          <div>
            <p className="text-[11px] text-[--color-text-muted] mb-2">
              Awaiting customer acceptance
              {offer.recipient?.email && ` · ${offer.recipient.email}`}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                loading={loading === 'resend'}
                onClick={() => handle('resend', onResend)}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Resend
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRevoke(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                leftIcon={<XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Revoke
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
