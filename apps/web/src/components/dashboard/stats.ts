import type { OfferItem } from '@offeraccept/types';

export function computeStats(offers: OfferItem[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // "Sent" means it left DRAFT. The list API carries no sentAt, so the month is
  // approximated by createdAt: an offer created last month but sent this month is
  // not counted. Drafts must be excluded — they have not been sent to anyone.
  const sentThisMonth = offers.filter(
    (o) => o.status !== 'DRAFT' && new Date(o.createdAt) >= startOfMonth,
  ).length;
  const accepted = offers.filter((o) => o.status === 'ACCEPTED').length;
  const total = offers.length;
  const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
  const needsAttention = offers.filter((o) => o.status === 'SENT').length;

  return { sentThisMonth, accepted, rate, needsAttention };
}
