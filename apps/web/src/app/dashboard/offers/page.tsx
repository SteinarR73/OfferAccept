'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { listOffers } from '../../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { OfferTable } from '../../../components/dashboard/OfferTable';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';

const PAGE_SIZE = 20;

export default function OffersPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listOffers(page, PAGE_SIZE)
      .then(({ data, total }) => { setOffers(data); setTotal(total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startRow = (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Offers"
        description="Send, track, and manage all your offer letters."
        action={
          <Link href="/dashboard/offers/new">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}>
              New offer
            </Button>
          </Link>
        }
      />

      <OfferTable offers={offers} loading={loading} />

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-xs text-[--color-text-muted]">
          <span>
            Showing {startRow}–{endRow} of {total} offers
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />}
              aria-label="Previous page"
            >
              Prev
            </Button>
            <span className="text-xs font-medium text-gray-700">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
