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
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Deals"
        description="Send, track, and manage your deals."
        action={
          <Link href="/dashboard/deals/new">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              New deal
            </Button>
          </Link>
        }
      />

      {/* ── Pipeline overview ─────────────────────────────────────────────────── */}
      <DealsPipeline offers={offers} loading={loading} />

      {/* ── Deals table ───────────────────────────────────────────────────────── */}
      <OfferTable
        offers={offers}
        loading={loading}
        headingLabel="Deals"
        columnLabels={{ title: 'Deal name', recipient: 'Customer' }}
      />
    </div>
  );
}
