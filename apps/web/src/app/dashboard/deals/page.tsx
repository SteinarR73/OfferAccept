'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listOffers } from '../../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { OfferTable } from '../../../components/dashboard/OfferTable';
import { DealsPipeline } from '../../../components/dashboard/DealsPipeline';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';

// ─── DealsPage ─────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listOffers(1, 200)
      .then(({ data }) => setOffers(data))
      .catch(() => { /* graceful degradation */ })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Offers"
        description="Send, track, and manage your offers."
        action={
          <Link href="/dashboard/offers/new">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Create offer
            </Button>
          </Link>
        }
      />

      {/* ── Pipeline overview ─────────────────────────────────────────────────── */}
      <DealsPipeline offers={offers} loading={loading} />

      {/* ── Offers table ───────────────────────────────────────────────────────── */}
      <OfferTable
        offers={offers}
        loading={loading}
        headingLabel="Offers"
        columnLabels={{ title: 'Offer name', recipient: 'Recipient' }}
      />
    </div>
  );
}
