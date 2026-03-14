'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { listOffers } from '../../lib/offers-api';
import type { OfferItem } from '@offeracept/types';

// ─── DashboardPage ────────────────────────────────────────────────────────────
// Lists all offers for the authenticated org. Minimal table view.

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

export default function DashboardPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOffers(1, 50)
      .then(({ data, total }) => { setOffers(data); setTotal(total); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Offers ({total})</h1>
        <Link
          href="/dashboard/offers/new"
          style={{ padding: '8px 16px', background: '#1d4ed8', color: '#fff', borderRadius: 4, textDecoration: 'none' }}
        >
          New offer
        </Link>
      </div>

      {offers.length === 0 && (
        <p style={{ color: '#6b7280' }}>No offers yet. Create your first offer above.</p>
      )}

      {offers.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Title</th>
              <th style={{ padding: '8px 12px' }}>Recipient</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 12px' }}>
                  <Link href={`/dashboard/offers/${offer.id}`}>{offer.title}</Link>
                </td>
                <td style={{ padding: '8px 12px', color: '#6b7280' }}>
                  {offer.recipient?.email ?? '—'}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <StatusBadge status={offer.status} />
                </td>
                <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 13 }}>
                  {new Date(offer.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: '#6b7280',
    SENT: '#2563eb',
    ACCEPTED: '#16a34a',
    DECLINED: '#dc2626',
    EXPIRED: '#9ca3af',
    REVOKED: '#7c3aed',
  };
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        background: colors[status] ?? '#6b7280',
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
