'use client';

import { useEffect, useState } from 'react';
import { listOffers } from '../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Shared fetch-on-mount for the offer list, used by every dashboard page that
// needs the full (paginated) offer set as its data source (deals, customers,
// documents). Consolidates the identical useState/useEffect/listOffers
// boilerplate that was previously duplicated across those pages.

export interface UseOffersReturn {
  offers: OfferItem[];
  loading: boolean;
}

export function useOffers(page: number, pageSize: number): UseOffersReturn {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listOffers(page, pageSize)
      .then(({ data }) => setOffers(data))
      .catch(() => { /* graceful degradation */ })
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  return { offers, loading };
}
