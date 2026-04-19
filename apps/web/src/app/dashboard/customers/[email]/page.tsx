'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Mail, TrendingUp, Clock } from 'lucide-react';
import { listOffers } from '../../../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Card, CardHeader, CardSection } from '../../../../components/ui/Card';
import { OfferTable } from '../../../../components/dashboard/OfferTable';
import { ActivityFeed } from '../../../../components/dashboard/ActivityFeed';
import { SpinnerPage } from '../../../../components/ui/Spinner';

// ─── CustomerDetailPage ────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export default function CustomerDetailPage() {
  const { email: rawEmail } = useParams<{ email: string }>();
  const email = decodeURIComponent(rawEmail ?? '');

  const [allOffers, setAllOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listOffers(1, 200)
      .then(({ data }) => setAllOffers(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const customerOffers = useMemo(
    () => allOffers.filter((o) => o.recipient?.email?.toLowerCase() === email.toLowerCase()),
    [allOffers, email],
  );

  const customerName = customerOffers[0]?.recipient?.name ?? email;

  const lastAccepted = customerOffers
    .filter((o) => o.status === 'ACCEPTED')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  const lastActivity = customerOffers
    .map((o) => o.updatedAt)
    .sort()
    .reverse()[0];

  const acceptedCount = customerOffers.filter((o) => o.status === 'ACCEPTED').length;

  if (loading) return <SpinnerPage label="Loading customer…" />;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        title={customerName}
        description={email}
        backHref="/dashboard/customers"
        backLabel="All customers"
        action={
          <Link
            href={`/dashboard/deals/new?email=${encodeURIComponent(email)}&name=${encodeURIComponent(customerName)}`}
          >
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

      {/* ── Customer info card ───────────────────────────────────────────────── */}
      <CustomerInfoCard
        email={email}
        dealCount={customerOffers.length}
        acceptedCount={acceptedCount}
        lastAcceptedTitle={lastAccepted?.title}
        lastActivity={lastActivity}
      />

      {/* ── Deals table + Activity ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OfferTable
            offers={customerOffers}
            loading={false}
            headingLabel="Deals"
            columnLabels={{ title: 'Deal name', recipient: 'Customer' }}
          />
        </div>
        <div className="lg:col-span-1">
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}

// ─── CustomerInfoCard ─────────────────────────────────────────────────────────

interface CustomerInfoCardProps {
  email: string;
  dealCount: number;
  acceptedCount: number;
  lastAcceptedTitle?: string;
  lastActivity?: string;
}

function CustomerInfoCard({
  email,
  dealCount,
  acceptedCount,
  lastAcceptedTitle,
  lastActivity,
}: CustomerInfoCardProps) {
  return (
    <Card>
      <CardHeader title="Customer info" border />
      <CardSection>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-1">
              <Mail className="w-3 h-3" aria-hidden="true" />
              Email
            </dt>
            <dd className="text-sm text-(--color-text-primary) truncate max-w-[200px]">{email}</dd>
          </div>

          <div>
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-1">
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
              Deals
            </dt>
            <dd className="text-2xl font-bold text-(--color-text-primary) tabular-nums">
              {dealCount}
              {acceptedCount > 0 && (
                <span className="text-xs font-normal text-(--color-success-text) ml-2">
                  {acceptedCount} accepted
                </span>
              )}
            </dd>
          </div>

          {lastAcceptedTitle && (
            <div>
              <dt className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-1">
                Last accepted
              </dt>
              <dd className="text-sm text-(--color-text-secondary) truncate max-w-[180px]">{lastAcceptedTitle}</dd>
            </div>
          )}

          {lastActivity && (
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-1">
                <Clock className="w-3 h-3" aria-hidden="true" />
                Last activity
              </dt>
              <dd className="text-sm text-(--color-text-secondary)">
                {new Date(lastActivity).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </dd>
            </div>
          )}
        </dl>
      </CardSection>
    </Card>
  );
}
