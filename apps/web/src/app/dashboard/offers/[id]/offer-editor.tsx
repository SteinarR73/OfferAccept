'use client';

import { useState } from 'react';
import { FileText, FileUp, Trash2 } from 'lucide-react';
import {
  updateOffer,
  setRecipient,
  removeDocument,
} from '../../../../lib/offers-api';
import type { OfferItem, OfferDocumentItem } from '@offeraccept/types';
import { FileUploadFlow } from '../../../../components/dashboard/FileUploadFlow';
import { Card, CardHeader, CardSection, CardFooter } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Input, Textarea } from '../../../../components/ui/Input';
import { Alert } from '../../../../components/ui/Alert';

// ─── OfferEditor ──────────────────────────────────────────────────────────────
// Displays and edits the offer content (DRAFT only).
// Non-DRAFT offers show read-only fields.
// Send/Revoke actions are handled by the parent page (StatusActionBar).

interface Props {
  initial: OfferItem;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('docx')) return '📝';
  return '📎';
}

export function OfferEditor({ initial }: Props) {
  const [offer, setOffer] = useState<OfferItem>(initial);
  const [title, setTitle] = useState(offer.title);
  const [message, setMessage] = useState(offer.message ?? '');
  const [expiresAt, setExpiresAt] = useState(
    offer.expiresAt ? new Date(offer.expiresAt).toISOString().slice(0, 10) : '',
  );
  const [recipientEmail, setRecipientEmail] = useState(offer.recipient?.email ?? '');
  const [recipientName, setRecipientName] = useState(offer.recipient?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [removingDoc, setRemovingDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDraft = offer.status === 'DRAFT';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOffer(offer.id, {
        title,
        message: message || undefined,
        expiresAt: expiresAt || undefined,
      });
      if (recipientEmail) {
        await setRecipient(offer.id, { email: recipientEmail, name: recipientName });
      }
      setOffer(updated);
      setSuccess('Changes saved.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveDoc(docId: string) {
    setRemovingDoc(docId);
    try {
      await removeDocument(offer.id, docId);
      setOffer((o) => ({ ...o, documents: o.documents.filter((d: OfferDocumentItem) => d.id !== docId) }));
    } catch {
      setError('Could not remove document. Please try again.');
    } finally {
      setRemovingDoc(null);
    }
  }

  function handleDocumentAdded(docId: string, filename: string) {
    // Optimistically append a minimal document entry; full data loads on next refresh
    const placeholder: OfferDocumentItem = {
      id: docId,
      filename,
      mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 0,
      sha256Hash: '',
    };
    setOffer((o) => ({ ...o, documents: [...o.documents, placeholder] }));
  }

  return (
    <form onSubmit={handleSave} noValidate>
      {error && <Alert variant="error" dismissible className="mb-4">{error}</Alert>}
      {success && <Alert variant="success" dismissible className="mb-4">{success}</Alert>}

      {/* ── Section 1: Deal details ─────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader title="Deal details" border />
        <CardSection>
          <div className="space-y-4">
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isDraft}
              required
            />
            <Textarea
              label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={!isDraft}
              hint="This statement will be shown to the recipient before they accept the deal. Maximum 2,000 characters."
              rows={4}
              maxLength={2000}
            />
            <Input
              label="Expiry date"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={!isDraft}
              hint="Leave blank for no expiry."
            />
          </div>
        </CardSection>
        {isDraft && (
          <CardFooter>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Save draft
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* ── Section 2: Recipient ─────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader title="Recipient" border />
        <CardSection>
          <div className="space-y-4">
            <Input
              label="Full name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={!isDraft}
            />
            <Input
              label="Email address"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={!isDraft}
              hint={isDraft ? 'A secure deal link will be delivered to this address.' : undefined}
            />
          </div>
        </CardSection>
        {isDraft && (
          <CardFooter>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Save
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* ── Section 3: Documents ─────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Documents" description="PDF and DOCX files attached to this deal." border />

        {/* Document list */}
        {offer.documents.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {offer.documents.map((doc: OfferDocumentItem) => (
              <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-base flex-shrink-0" aria-hidden="true">{fileIcon(doc.mimeType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{doc.filename}</p>
                  <p className="text-[11px] text-[--color-text-muted] mt-0.5">
                    {formatBytes(doc.sizeBytes)}
                    {doc.sha256Hash && (
                      <span className="ml-2 font-mono">SHA-256: {doc.sha256Hash.slice(0, 8)}…</span>
                    )}
                  </p>
                </div>
                <FileText className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" aria-hidden="true" />
                {isDraft && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    loading={removingDoc === doc.id}
                    onClick={() => handleRemoveDoc(doc.id)}
                    aria-label={`Remove ${doc.filename}`}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {offer.documents.length === 0 && !isDraft && (
          <p className="px-5 py-4 text-xs text-[--color-text-muted]">No documents attached.</p>
        )}

        {/* Upload — DRAFT only */}
        {isDraft && (
          <div className="px-5 py-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-[--color-text-muted] mb-3">
              <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload additional documents (PDF or DOCX, max 20 MB each)</span>
            </div>
            <FileUploadFlow
              offerId={offer.id}
              onUploaded={handleDocumentAdded}
            />
          </div>
        )}
      </Card>
    </form>
  );
}
