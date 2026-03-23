'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Users } from 'lucide-react';
import { listOffers } from '../../../lib/offers-api';
import type { OfferItem } from '@offeraccept/types';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { cn } from '@/lib/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  email: string;
  name: string;
  dealCount: number;
  acceptedCount: number;
  lastActivity: string;
}

// ─── Derivation ───────────────────────────────────────────────────────────────

function deriveCustomers(offers: OfferItem[]): Customer[] {
  const map = new Map<string, { name: string; deals: OfferItem[] }>();

  for (const o of offers) {
    if (!o.recipient?.email) continue;
    const key = o.recipient.email.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.deals.push(o);
    } else {
      map.set(key, { name: o.recipient.name ?? o.recipient.email, deals: [o] });
    }
  }

  return Array.from(map.entries())
    .map(([email, { name, deals }]) => ({
      email,
      name,
      dealCount: deals.length,
      acceptedCount: deals.filter((d) => d.status === 'ACCEPTED').length,
      lastActivity: deals
        .map((d) => d.updatedAt)
        .sort()
        .reverse()[0] ?? '',
    }))
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── CustomersPage ─────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listOffers(1, 200)
      .then(({ data }) => setOffers(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const customers = useMemo(() => deriveCustomers(offers), [offers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [customers, search]);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Customers"
        description="Everyone who has received a deal from you"
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

      {/* ── Table card ───────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200" aria-labelledby="customers-heading">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100">
          <h2 id="customers-heading" className="text-base font-semibold text-gray-900">
            Customers
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({filtered.length}{search ? ` of ${customers.length}` : ''})
              </span>
            )}
          </h2>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search customers"
              className={cn(
                'w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200',
                'placeholder:text-gray-400 text-gray-900 bg-gray-50',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white',
                'transition-colors',
              )}
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <CustomersSkeleton />
        ) : filtered.length === 0 ? (
          <CustomersEmpty hasCustomers={customers.length > 0} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[35%]">
                    Customer
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Deals
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Last activity
                  </th>
                  <th scope="col" className="sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr
                    key={customer.email}
                    className="table-row-hover border-b border-gray-50 last:border-0 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/customers/${encodeURIComponent(customer.email)}`}
                        className="flex items-center gap-2.5 group"
                      >
                        <div
                          className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-blue-700 uppercase"
                          aria-hidden="true"
                        >
                          {customer.name.slice(0, 1)}
                        </div>
                        <span className="font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                          {customer.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 text-xs hidden sm:table-cell">
                      {customer.email}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{customer.dealCount}</span>
                        {customer.acceptedCount > 0 && (
                          <span className="text-xs text-green-700 bg-green-50 rounded-full px-1.5 py-0.5">
                            {customer.acceptedCount} accepted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 hidden md:table-cell">
                      {customer.lastActivity ? relativeTime(customer.lastActivity) : '—'}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/deals/new?email=${encodeURIComponent(customer.email)}&name=${encodeURIComponent(customer.name)}`}
                          className="inline-flex items-center gap-1 text-xs text-[--color-accent] hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded whitespace-nowrap"
                          aria-label={`New deal for ${customer.name}`}
                        >
                          <Plus className="w-3 h-3" aria-hidden="true" />
                          New deal
                        </Link>
                        <Link
                          href={`/dashboard/customers/${encodeURIComponent(customer.email)}`}
                          className="text-xs text-gray-400 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 rounded transition-colors"
                          aria-label={`View ${customer.name}`}
                        >
                          View →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CustomersSkeleton() {
  return (
    <div className="px-5 py-4 space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton-shimmer w-7 h-7 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton-shimmer h-3.5 w-32 rounded" />
          </div>
          <div className="skeleton-shimmer h-3 w-40 rounded hidden sm:block" />
          <div className="skeleton-shimmer h-5 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}

function CustomersEmpty({ hasCustomers }: { hasCustomers: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3" aria-hidden="true">
        <Users className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-900">
        {hasCustomers ? 'No matching customers' : 'No customers yet'}
      </p>
      <p className="text-xs text-gray-400 mt-1 mb-4">
        {hasCustomers
          ? 'Try a different search term.'
          : 'Customers appear here when you send deals to recipients.'}
      </p>
      {!hasCustomers && (
        <Link
          href="/dashboard/deals/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
        >
          Create first deal
        </Link>
      )}
    </div>
  );
}
