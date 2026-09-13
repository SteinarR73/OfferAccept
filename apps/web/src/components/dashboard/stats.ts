import type { OfferItem } from '@offeraccept/types';

export function computeStats(offers: OfferItem[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonth = offers.filter((o) => new Date(o.createdAt) >= startOfMonth);
  const sentThisMonth = thisMonth.length;
  const accepted = offers.filter((o) => o.status === 'ACCEPTED').length;
  const total = offers.length;
  const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
  const needsAttention = offers.filter((o) => o.status === 'SENT').length;

  return { sentThisMonth, accepted, rate, needsAttention };
}
