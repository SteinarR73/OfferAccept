'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getOffer } from '../../../../lib/offers-api';
import { OfferEditor } from './offer-editor';
import type { OfferItem } from '@offeracept/types';

// ─── OfferDetailPage ──────────────────────────────────────────────────────────
// Client-side data fetch (localStorage JWT → not available server-side).
// Renders the OfferEditor once data is loaded.

export const dynamic = 'force-dynamic';

export default function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOffer(id)
      .then(setOffer)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!offer) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ marginBottom: 20, color: '#6b7280', fontSize: 14 }}>
        <a href="/dashboard">← Offers</a>
      </div>
      <h1 style={{ marginBottom: 24 }}>{offer.title}</h1>
      <OfferEditor initial={offer} />
    </div>
  );
}
