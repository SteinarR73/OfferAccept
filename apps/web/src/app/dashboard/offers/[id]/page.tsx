'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Send, RotateCcw, XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getOffer,
  sendOffer,
  revokeOffer,
  resendOffer,
} from '../../../../lib/offers-api';
import type { OfferItem, OfferStatusValue } from '@offeraccept/types';
import { OfferEditor } from './offer-editor';
import { DeliveryTimeline } from '../../../../components/dashboard/DeliveryTimeline';
import { DealTimeline } from '../../../../components/dashboard/DealTimeline';
import { CertificateShowcase } from '../../../../components/dashboard/CertificateShowcase';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Card, CardHeader, CardSection } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Alert } from '../../../../components/ui/Alert';
import { OfferStatusBadge } from '../../../../components/ui/Badge';
import { SpinnerPage } from '../../../../components/ui/Spinner';

export const dynamic = 'force-dynamic';

// ─── Extended offer type (API may return certificateId beyond the shared type) ─

interface OfferItemExtended extends OfferItem {
  certificateId?: string;
}

// ─── Status action bar ────────────────────────────────────────────────────────

interface StatusActionBarProps {
  offer: OfferItemExtended;
  onSend: () => Promise<void>;
  onRevoke: () => Promise<void>;
  onResend: () => Promise<void>;
}

function StatusActionBar({ offer, onSend, onRevoke, onResend }: StatusActionBarProps) {
  const [loading, setLoading] = useState<'send' | 'revoke' | 'resend' | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: 'send' | 'revoke' | 'resend', fn: () => Promise<void>) {
    setLoading(action);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed. Please try again.');
    } finally {
      setLoading(null);
      setConfirmRevoke(false);
    }
  }

  if (offer.status === 'DRAFT') {
    const canSend = !!offer.recipient?.email;
    return (
      <div className="space-y-2">
        {error && <Alert variant="error" dismissible>{error}</Alert>}
        {!canSend && (
          <Alert variant="warning">Add a recipient before sending this deal.</Alert>
        )}
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
    );
  }

  if (offer.status === 'SENT') {
    return (
      <div className="space-y-2">
        {error && <Alert variant="error" dismissible>{error}</Alert>}
        {confirmRevoke ? (
          <Alert variant="warning">
            <div className="space-y-2">
              <p className="text-xs font-semibold">Revoke this deal?</p>
              <p className="text-xs">The recipient's signing link will be invalidated immediately.</p>
              <div className="flex gap-2 mt-2">
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
            </div>
          </Alert>
        ) : (
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
        )}
      </div>
    );
  }

  return null;
}


// ─── OfferDetailPage ──────────────────────────────────────────────────────────

export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferItemExtended | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getOffer(id)
      .then((data) => setOffer(data as OfferItemExtended))
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Optimistic status updates — revert on error
  async function handleSend() {
    const prev = offer!.status;
    setOffer((o) => o ? { ...o, status: 'SENT' as OfferStatusValue } : o);
    try {
      await sendOffer(id);
    } catch (err) {
      setOffer((o) => o ? { ...o, status: prev } : o);
      throw err;
    }
    refresh();
  }

  async function handleRevoke() {
    const prev = offer!.status;
    setOffer((o) => o ? { ...o, status: 'REVOKED' as OfferStatusValue } : o);
    try {
      await revokeOffer(id);
    } catch (err) {
      setOffer((o) => o ? { ...o, status: prev } : o);
      throw err;
    }
  }

  async function handleResend() {
    await resendOffer(id);
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <PageHeader title="Deal" backHref="/dashboard/offers" backLabel="All deals" />
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  if (!offer) return <SpinnerPage label="Loading deal…" />;

  const showActions = offer.status === 'DRAFT' || offer.status === 'SENT';
  const terminalStatus = ['ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'].includes(offer.status);

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title={offer.title}
        backHref="/dashboard/offers"
        backLabel="All deals"
        action={
          <div className="flex items-center gap-2">
            <OfferStatusBadge status={offer.status} />
          </div>
        }
      />

      {/* ── Terminal status alert ─────────────────────────────────────────── */}
      {offer.status === 'REVOKED' && (
        <Alert variant="warning" className="mb-4">
          This deal has been revoked. The recipient's signing link is no longer valid.
        </Alert>
      )}
      {offer.status === 'EXPIRED' && (
        <Alert variant="warning" className="mb-4">
          This deal has expired. Create a new deal to re-engage the customer.
        </Alert>
      )}
      {offer.status === 'DECLINED' && (
        <Alert variant="error" className="mb-4">
          The customer declined this deal.
        </Alert>
      )}

      {/* ── Certificate card (when accepted) ────────────────────────────── */}
      {offer.status === 'ACCEPTED' && offer.certificateId && (
        <CertificateShowcase certificateId={offer.certificateId} />
      )}
      {offer.status === 'ACCEPTED' && !offer.certificateId && (
        <Alert variant="success" className="mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
            <span>This deal was accepted. Certificate generation may still be in progress.</span>
          </div>
        </Alert>
      )}

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Offer editor — left 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Action bar above editor */}
          {showActions && (
            <Card>
              <CardSection className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-700">
                      {offer.status === 'DRAFT' ? 'Draft — not yet sent to customer' : 'Awaiting customer acceptance'}
                    </p>
                    {offer.status === 'SENT' && offer.recipient?.email && (
                      <p className="text-[11px] text-[--color-text-muted] mt-0.5">
                        Sent to {offer.recipient.email}
                      </p>
                    )}
                  </div>
                  <StatusActionBar
                    offer={offer}
                    onSend={handleSend}
                    onRevoke={handleRevoke}
                    onResend={handleResend}
                  />
                </div>
              </CardSection>
            </Card>
          )}

          {terminalStatus && (
            <Card>
              <CardSection className="py-3">
                <div className="flex items-center gap-2 text-xs text-[--color-text-muted]">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  <span>This deal is {offer.status.toLowerCase()} and can no longer be edited.</span>
                </div>
              </CardSection>
            </Card>
          )}

          <OfferEditor initial={offer} />
        </div>

        {/* Right sidebar: lifecycle timeline + delivery timeline */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <DealTimeline offerId={id} />
          <DeliveryTimeline offerId={id} offerStatus={offer.status as 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED'} />
        </div>
      </div>
    </div>
  );
}
