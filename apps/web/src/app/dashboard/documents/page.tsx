'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, ShieldCheck, ExternalLink } from 'lucide-react';
import { listOffers } from '../../../lib/offers-api';
import type { OfferItem, OfferDocumentItem } from '@offeraccept/types';
import { PageHeader } from '../../../components/ui/PageHeader';
import { cn } from '@/lib/cn';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FlatDocument {
  doc: OfferDocumentItem;
  offer: OfferItem;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mimeType: string): string {
  if (mimeType.includes('pdf'))  return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'DOCX';
  if (mimeType.includes('image')) return 'IMG';
  return 'FILE';
}

const MIME_BADGE: Record<string, string> = {
  PDF:  'bg-red-100 text-red-700',
  DOCX: 'bg-blue-100 text-blue-700',
  IMG:  'bg-purple-100 text-purple-700',
  FILE: 'bg-gray-100 text-gray-600',
};

const STATUS_BADGE: Record<OfferItem['status'], { label: string; classes: string }> = {
  DRAFT:    { label: 'Draft',    classes: 'bg-gray-100 text-gray-600'   },
  SENT:     { label: 'Sent',     classes: 'bg-blue-100 text-blue-700'   },
  ACCEPTED: { label: 'Verified', classes: 'bg-green-100 text-green-700' },
  DECLINED: { label: 'Declined', classes: 'bg-red-100 text-red-600'     },
  EXPIRED:  { label: 'Expired',  classes: 'bg-amber-100 text-amber-700' },
  REVOKED:  { label: 'Revoked',  classes: 'bg-purple-100 text-purple-700' },
};

// ─── DocumentsPage ─────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [flatDocs, setFlatDocs] = useState<FlatDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listOffers(1, 200)
      .then(({ data }) => {
        const all: FlatDocument[] = data.flatMap((offer) =>
          offer.documents.map((doc) => ({ doc, offer })),
        );
        setFlatDocs(all);
      })
      .catch(() => { /* graceful degradation */ })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Documents"
        description="All documents attached to your deals"
      />

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      <section
        className="bg-white rounded-xl border border-gray-200"
        aria-labelledby="documents-heading"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 id="documents-heading" className="text-base font-semibold text-gray-900">
            Documents
            {!loading && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({flatDocs.length})
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <DocumentsTableSkeleton />
        ) : flatDocs.length === 0 ? (
          <EmptyDocuments />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[35%]">
                    Document
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Linked deal
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Deal status
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Verification
                  </th>
                  <th scope="col" className="sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flatDocs.map(({ doc, offer }) => {
                  const mime = mimeLabel(doc.mimeType);
                  const statusMeta = STATUS_BADGE[offer.status];
                  const isVerified = offer.status === 'ACCEPTED';
                  return (
                    <tr
                      key={`${offer.id}-${doc.id}`}
                      className="table-row-hover border-b border-gray-50 last:border-0 transition-colors"
                    >
                      {/* Document name + type */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'flex-shrink-0 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold',
                              MIME_BADGE[mime] ?? MIME_BADGE.FILE,
                            )}
                          >
                            {mime}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate max-w-[220px]">
                              {doc.filename}
                            </p>
                            <p className="text-xs text-gray-400">{formatBytes(doc.sizeBytes)}</p>
                          </div>
                        </div>
                      </td>

                      {/* Linked deal */}
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <Link
                          href={`/dashboard/offers/${offer.id}`}
                          className="inline-flex items-center gap-1 text-sm text-[--color-accent] hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 rounded truncate max-w-[180px]"
                        >
                          <FileText className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                          <span className="truncate">{offer.title}</span>
                        </Link>
                      </td>

                      {/* Deal status */}
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                          statusMeta.classes,
                        )}>
                          {statusMeta.label}
                        </span>
                      </td>

                      {/* Verification */}
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            Verified
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3.5 text-right">
                        <Link
                          href={`/dashboard/offers/${offer.id}`}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 rounded transition-colors"
                          aria-label={`Open deal for ${doc.filename}`}
                        >
                          Open
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DocumentsTableSkeleton() {
  return (
    <div className="px-5 py-4 space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton-shimmer h-5 w-10 rounded" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton-shimmer h-3.5 w-48 rounded" />
            <div className="skeleton-shimmer h-2.5 w-16 rounded" />
          </div>
          <div className="skeleton-shimmer h-4 w-32 rounded hidden sm:block" />
          <div className="skeleton-shimmer h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyDocuments() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3" aria-hidden="true">
        <FileText className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-900">No documents yet</p>
      <p className="text-xs text-gray-400 mt-1 mb-4">
        Documents appear here when you attach files to a deal.
      </p>
      <Link
        href="/dashboard/offers/new"
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
      >
        Create a deal
      </Link>
    </div>
  );
}
