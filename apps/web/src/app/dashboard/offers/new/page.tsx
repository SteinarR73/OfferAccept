'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createOffer } from '../../../../lib/offers-api';

// ─── NewOfferPage ─────────────────────────────────────────────────────────────
// Creates a new DRAFT offer and redirects to the editor page.

export default function NewOfferPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { offerId } = await createOffer({
        title,
        recipient: recipientEmail ? { email: recipientEmail, name: recipientName } : undefined,
      });
      router.push(`/dashboard/offers/${offerId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create offer.');
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ marginBottom: 24 }}>New offer</h1>
      <form onSubmit={handleSubmit}>
        <Field label="Offer title *">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <legend style={{ fontWeight: 600, padding: '0 4px' }}>Recipient</legend>
          <Field label="Email *">
            <input
              type="email"
              required
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
          </Field>
          <Field label="Name *">
            <input
              type="text"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </Field>
        </fieldset>

        {error && <p style={{ color: 'red', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => router.back()} style={{ padding: '8px 16px' }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '8px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {loading ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'block' }}>{children}</div>
    </div>
  );
}
