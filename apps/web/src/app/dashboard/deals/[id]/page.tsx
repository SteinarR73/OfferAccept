'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
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

export const dynamic = 'force-dynamic';

// ─── Extended type (API may return certificateId) ─────────────────────────────

interface OfferItemExtended extends OfferItem {
  certificateId?: string;
}

// ─── DealDetailPage ────────────────────────────────────────────────────────────

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferItemExtended | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getOffer(id)
      .then((data) => setOffer(data as OfferItemExtended))
      .catch((err: Error) => setError(err.message));
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
        <PageHeader title="Deal" backHref="/dashboard/deals" backLabel="All deals" />
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  if (!offer) return <SpinnerPage label="Loading deal…" />;

  const isAccepted = offer.status === 'ACCEPTED';
  const isDeclined = offer.status === 'DECLINED';
  const isRevoked  = offer.status === 'REVOKED';
  const isExpired  = offer.status === 'EXPIRED';

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <PageHeader
        title={offer.title}
        backHref="/dashboard/deals"
        backLabel="All deals"
        action={<OfferStatusBadge status={offer.status} />}
      />

      {/* ── Terminal status alerts ──────────────────────────────────────────── */}
      {isRevoked && (
        <Alert variant="warning">
          This deal has been revoked. The signing link is no longer valid.
        </Alert>
      )}
      {isExpired && (
        <Alert variant="warning">
          This deal has expired. Create a new deal to re-engage the customer.
        </Alert>
      )}
      {isDeclined && (
        <Alert variant="error">The customer declined this deal.</Alert>
      )}

      {/* ── Certificate (ACCEPTED + certificateId) ─────────────────────────── */}
      {isAccepted && offer.certificateId && (
        <CertificateShowcase certificateId={offer.certificateId} />
      )}
      {isAccepted && !offer.certificateId && (
        <Alert variant="success">
          Deal accepted. Certificate generation may still be in progress.
        </Alert>
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
