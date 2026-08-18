'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useOffers } from '../../../hooks/useOffers';
import { OfferTable } from '../../../components/dashboard/OfferTable';
import { DealsPipeline } from '../../../components/dashboard/DealsPipeline';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';

// ─── DealsPage ─────────────────────────────────────────────────────────────────

export default function DealsPage() {
  const { offers, loading } = useOffers(1, 200);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Offers"
        description="Send, track, and manage your offers."
        action={
          <Link href="/dashboard/deals/new">
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
