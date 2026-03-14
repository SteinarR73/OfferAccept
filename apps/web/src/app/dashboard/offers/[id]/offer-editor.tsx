'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateOffer,
  setRecipient,
  sendOffer,
  revokeOffer,
} from '../../../../lib/offers-api';
import type { OfferItem } from '@offeracept/types';

// ─── OfferEditor ──────────────────────────────────────────────────────────────
// Client component for viewing and editing a single offer.
// Read-only when offer is not DRAFT. Shows send/revoke actions appropriately.

interface Props {
  initial: OfferItem;
}

export function OfferEditor({ initial }: Props) {
  const router = useRouter();
  const [offer, setOffer] = useState<OfferItem>(initial);
  const [title, setTitle] = useState(offer.title);
  const [message, setMessage] = useState(offer.message ?? '');
  const [expiresAt, setExpiresAt] = useState(
    offer.expiresAt ? new Date(offer.expiresAt).toISOString().slice(0, 10) : '',
  );
  const [recipientEmail, setRecipientEmail] = useState(offer.recipient?.email ?? '');
  const [recipientName, setRecipientName] = useState(offer.recipient?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDraft = offer.status === 'DRAFT';
  const isSent = offer.status === 'SENT';

  async function handleSave(e: FormEvent) {
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
      setSuccess('Saved.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!confirm('Send this offer? This will freeze the content and email the recipient.')) return;
    setError(null);
    try {
      await sendOffer(offer.id);
      router.refresh();
      setOffer((o) => ({ ...o, status: 'SENT' }));
      setSuccess('Offer sent! The recipient will receive an email shortly.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send.');
    }
  }

  async function handleRevoke() {
    if (!confirm('Revoke this offer? The signing link will be invalidated immediately.')) return;
    setError(null);
    try {
      await revokeOffer(offer.id);
      setOffer((o) => ({ ...o, status: 'REVOKED' }));
      setSuccess('Offer revoked.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke.');
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Status banner */}
      {!isDraft && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: 20,
            borderRadius: 4,
            background: '#f3f4f6',
            color: '#374151',
          }}
        >
          This offer is <strong>{offer.status}</strong>. Content is read-only.
          {offer.status === 'ACCEPTED' && ' The recipient has accepted.'}
          {offer.status === 'DECLINED' && ' The recipient declined.'}
          {offer.status === 'REVOKED' && ' The signing link has been invalidated.'}
        </div>
      )}

      <form onSubmit={handleSave}>
        <Field label="Offer title">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isDraft}
          />
        </Field>

        <Field label="Message (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!isDraft}
            rows={5}
            style={{ width: '100%', fontFamily: 'inherit' }}
          />
        </Field>

        <Field label="Offer expires (optional)">
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={!isDraft}
          />
        </Field>

        <fieldset
          style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 16, marginBottom: 16 }}
        >
          <legend style={{ fontWeight: 600, padding: '0 4px' }}>Recipient</legend>
          <Field label="Email">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={!isDraft}
            />
          </Field>
          <Field label="Name">
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={!isDraft}
            />
          </Field>
        </fieldset>

        {/* Documents — v1 metadata only, no upload UI */}
        {offer.documents.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <strong>Documents ({offer.documents.length})</strong>
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              {offer.documents.map((d) => (
                <li key={d.id} style={{ fontSize: 14, color: '#374151' }}>
                  {d.filename} ({formatBytes(d.sizeBytes)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p style={{ color: 'red', marginBottom: 12 }}>{error}</p>}
        {success && <p style={{ color: '#16a34a', marginBottom: 12 }}>{success}</p>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {isDraft && (
            <>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: '8px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={handleSend}
                style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                Send offer
              </button>
            </>
          )}

          {isSent && (
            <button
              type="button"
              onClick={handleRevoke}
              style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              Revoke offer
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
