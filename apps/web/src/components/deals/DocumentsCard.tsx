'use client';

import { useState } from 'react';
import { FileText, Trash2, FileUp, ShieldCheck } from 'lucide-react';
import type { OfferItem, OfferDocumentItem } from '@offeraccept/types';
import { removeDocument } from '@/lib/offers-api';
import { FileUploadFlow } from '@/components/dashboard/FileUploadFlow';
import { Card, CardHeader, CardSection } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mimeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'DOCX';
  return 'FILE';
}

function mimeBadgeClass(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'bg-red-100 text-red-700';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}

// ─── DocumentsCard ────────────────────────────────────────────────────────────

interface DocumentsCardProps {
  offer: OfferItem;
  onDocumentAdded: (docId: string, filename: string) => void;
  onDocumentRemoved: (docId: string) => void;
}

export function DocumentsCard({ offer, onDocumentAdded, onDocumentRemoved }: DocumentsCardProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDraft = offer.status === 'DRAFT';
  const isAccepted = offer.status === 'ACCEPTED';

  async function handleRemove(doc: OfferDocumentItem) {
    setRemovingId(doc.id);
    setError(null);
    try {
      await removeDocument(offer.id, doc.id);
      onDocumentRemoved(doc.id);
    } catch {
      setError('Could not remove document. Please try again.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Documents"
        description={offer.documents.length > 0
          ? `${offer.documents.length} file${offer.documents.length !== 1 ? 's' : ''} attached`
          : 'No documents attached'}
        border
      />

      {error && (
        <div className="px-5 pt-3">
          <Alert variant="error" dismissible>{error}</Alert>
        </div>
      )}

      {/* Document list */}
      {offer.documents.length > 0 && (
        <ul className="divide-y divide-gray-50">
          {offer.documents.map((doc: OfferDocumentItem) => (
            <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
              {/* Type badge */}
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${mimeBadgeClass(doc.mimeType)}`}
                aria-hidden="true"
              >
                {mimeLabel(doc.mimeType)}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{doc.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-(--color-text-muted)">
                    {formatBytes(doc.sizeBytes)}
                  </span>
                  {doc.sha256Hash && (
                    <span className="text-[10px] font-mono text-gray-300 hidden sm:inline">
                      {doc.sha256Hash.slice(0, 8)}…
                    </span>
                  )}
                </div>
              </div>

              {/* Signed indicator */}
              {isAccepted && (
                <span title="Included in accepted deal">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" aria-label="Verified" />
                </span>
              )}

              {/* Remove (DRAFT only) */}
              {isDraft && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={removingId === doc.id}
                  onClick={() => handleRemove(doc)}
                  aria-label={`Remove ${doc.filename}`}
                  className="text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Empty state (non-draft) */}
      {offer.documents.length === 0 && !isDraft && (
        <CardSection>
          <div className="flex flex-col items-center py-4 text-center">
            <FileText className="w-6 h-6 text-gray-200 mb-2" aria-hidden="true" />
            <p className="text-xs text-(--color-text-muted)">No documents were attached to this deal.</p>
          </div>
        </CardSection>
      )}

      {/* Upload zone (DRAFT only) */}
      {isDraft && (
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-(--color-text-muted) mb-3">
            <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload PDF or DOCX (max 25 MB each)</span>
          </div>
          <FileUploadFlow
            offerId={offer.id}
            onUploaded={onDocumentAdded}
          />
        </div>
      )}
    </Card>
  );
}
