'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import {
  getOffer,
  sendOffer,
  revokeOffer,
  resendOffer,
} from '../../../../lib/offers-api';
import type { OfferItem, OfferStatusValue } from '@offeraccept/types';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Alert } from '../../../../components/ui/Alert';
import { OfferStatusBadge } from '../../../../components/ui/Badge';
import { SpinnerPage } from '../../../../components/ui/Spinner';
import { DealSummaryCard } from '../../../../components/deals/DealSummaryCard';
import { CustomerCard } from '../../../../components/deals/CustomerCard';
import { ProposalContextCard } from '../../../../components/deals/ProposalContextCard';
import { DocumentsCard } from '../../../../components/deals/DocumentsCard';
import { AcceptanceStatusCard } from '../../../../components/deals/AcceptanceStatusCard';
import { DealActivityLog } from '../../../../components/deals/DealActivityLog';
import { DeliveryTimeline } from '../../../../components/dashboard/DeliveryTimeline';
import { CertificateShowcase } from '../../../../components/dashboard/CertificateShowcase';
import { OfferLifecycleCard, type OfferLifecycleState } from '../../../../components/deals/OfferLifecycleCard';

export const dynamic = 'force-dynamic';

// ─── Extended type ────────────────────────────────────────────────────────────
// The API may return lifecycle timestamps beyond the base OfferItem shape.
// All fields are optional — if absent we derive sensible fallbacks.

interface OfferItemExtended extends OfferItem {
  certificateId?: string;
  sentAt?: string | null;
  openedAt?: string | null;
  acceptedAt?: string | null;
  certificateIssuedAt?: string | null;
}

// ─── Lifecycle state derivation ───────────────────────────────────────────────
// Uses precise API timestamps when available; falls back to status-based inference.

function deriveLifecycleState(offer: OfferItemExtended): OfferLifecycleState {
  const isSent     = offer.status !== 'DRAFT';
  const isAccepted = offer.status === 'ACCEPTED';

  return {
    // sentAt: prefer explicit API field, fall back to updatedAt when status proves it was sent
    sentAt: offer.sentAt ?? (isSent ? offer.updatedAt : null),
    // openedAt: no status-based fallback — only show if API returns it
    openedAt: offer.openedAt ?? null,
    // acceptedAt: use updatedAt as proxy when status is ACCEPTED and no explicit timestamp
    acceptedAt: offer.acceptedAt ?? (isAccepted ? offer.updatedAt : null),
    // certificateIssuedAt: any cert present means it was issued
    certificateIssuedAt: offer.certificateIssuedAt ?? (offer.certificateId ? offer.updatedAt : null),
    // verificationUrl: derive from certificateId
    verificationUrl: offer.certificateId ? `/verify/${offer.certificateId}` : null,
  };
}

// ─── DealDetailPage ────────────────────────────────────────────────────────────

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferItemExtended | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getOffer(id)
      .then((data) => setOffer(data as OfferItemExtended))
      .catch((err: { statusCode?: number }) => {
        if (err.statusCode === 404) setError('Offer not found.');
        else setError('Could not load offer. Please try again.');
      });
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Optimistic status updates ───────────────────────────────────────────────

  async function handleSend() {
    const prev = offer!.status;
    setOffer((o) => o ? { ...o, status: 'SENT' as OfferStatusValue } : o);
    try { await sendOffer(id); }
    catch (err) { setOffer((o) => o ? { ...o, status: prev } : o); throw err; }
    refresh();
  }

  async function handleRevoke() {
    const prev = offer!.status;
    setOffer((o) => o ? { ...o, status: 'REVOKED' as OfferStatusValue } : o);
    try { await revokeOffer(id); }
    catch (err) { setOffer((o) => o ? { ...o, status: prev } : o); throw err; }
  }

  async function handleResend() { await resendOffer(id); }

  // ── Document updates ────────────────────────────────────────────────────────

  function handleDocumentAdded(docId: string, filename: string) {
    setOffer((o) => {
      if (!o) return o;
      const placeholder = {
        id: docId,
        filename,
        mimeType: filename.endsWith('.pdf')
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 0,
        sha256Hash: '',
      };
      return { ...o, documents: [...o.documents, placeholder] };
    });
  }

  function handleDocumentRemoved(docId: string) {
    setOffer((o) => o ? { ...o, documents: o.documents.filter((d) => d.id !== docId) } : o);
  }

  // ── Error / loading ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <PageHeader title="Offer" backHref="/dashboard/deals" backLabel="All offers" />
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  if (!offer) return <SpinnerPage label="Loading offer…" />;

  const isAccepted = offer.status === 'ACCEPTED';
  const isDeclined = offer.status === 'DECLINED';
  const isRevoked  = offer.status === 'REVOKED';
  const isExpired  = offer.status === 'EXPIRED';
  const isDraft    = offer.status === 'DRAFT';

  const lifecycleState = deriveLifecycleState(offer);

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <PageHeader
        title={offer.title}
        backHref="/dashboard/deals"
        backLabel="All offers"
        action={<OfferStatusBadge status={offer.status} />}
      />

      {/* ── Terminal status alerts ──────────────────────────────────────────── */}
      {isRevoked && (
        <Alert variant="warning">
          This offer has been revoked. The acceptance link is no longer valid.
        </Alert>
      )}
      {isExpired && (
        <Alert variant="warning">
          This offer has expired. Create a new offer to re-engage the recipient.
        </Alert>
      )}
      {isDeclined && (
        <Alert variant="error">The recipient declined this offer.</Alert>
      )}

      {/* ── Lifecycle card — visible for any non-draft offer ───────────────── */}
      {!isDraft && (
        <OfferLifecycleCard
          offerTitle={offer.title}
          recipientName={offer.recipient?.name ?? undefined}
          recipientEmail={offer.recipient?.email ?? undefined}
          state={lifecycleState}
        />
      )}

      {/* ── Certificate showcase (ACCEPTED + certificateId) ────────────────── */}
      {isAccepted && offer.certificateId && (
        <CertificateShowcase certificateId={offer.certificateId} />
      )}

      {/* ── Certificate pending banner ─────────────────────────────────────── */}
      {isAccepted && !offer.certificateId && (
        <div className="rounded-2xl border border-[--color-success-border] bg-[--color-success-light] p-8 animate-scale-in text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-[--color-success] flex items-center justify-center ring-4 ring-[--color-success-border] animate-pulse-ring">
              <CheckCircle2 className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-[--color-success-text] mb-1">Offer accepted</h2>
          <p className="text-sm text-[--color-success-text]/80">Certificate generation is in progress — refresh in a moment.</p>
        </div>
      )}

      {/* ── Row 1: Deal summary (2/3) + Customer (1/3) ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <DealSummaryCard
            offer={offer}
            onSend={handleSend}
            onRevoke={handleRevoke}
            onResend={handleResend}
          />
        </div>
        <div className="lg:col-span-1">
          <CustomerCard offer={offer} />
        </div>
      </div>

      {/* ── Deal description / context ──────────────────────────────────────── */}
      <ProposalContextCard offer={offer} />

      {/* ── Row 2: Documents (2/3) + Delivery timeline (1/3) ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <DocumentsCard
            offer={offer}
            onDocumentAdded={handleDocumentAdded}
            onDocumentRemoved={handleDocumentRemoved}
          />
        </div>
        <div className="lg:col-span-1">
          <DeliveryTimeline
            offerId={id}
            offerStatus={offer.status as 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED'}
          />
        </div>
      </div>

      {/* ── Row 3: Acceptance status (1/3) + Activity log (2/3) ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <AcceptanceStatusCard status={offer.status} />
        </div>
        <div className="lg:col-span-2">
          <DealActivityLog offer={offer} />
        </div>
      </div>

    </div>
  );
}
