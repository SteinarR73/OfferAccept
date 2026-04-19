'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { Card, CardSection } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

// ─── /verify — Certificate ID lookup ─────────────────────────────────────────
// Public page linked from the landing page mock certificate.
// Takes a Certificate ID entered by the user and navigates to /verify/[id].
// No authentication required.

export default function VerifyIndexPage() {
  const router = useRouter();
  const [id, setId] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = id.trim();
    if (trimmed) router.push(`/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="min-h-screen bg-(--color-bg) flex flex-col items-center justify-start pt-20 px-4">
      <div className="flex items-center gap-2 mb-8">
        <Shield className="w-5 h-5 text-(--color-accent)" aria-hidden="true" />
        <span className="font-semibold text-sm text-gray-900">OfferAccept</span>
        <span className="text-gray-300 select-none">·</span>
        <span className="text-sm text-gray-500">Certificate verification</span>
      </div>

      <Card className="w-full max-w-sm">
        <div className="px-6 pt-6 pb-2 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Verify an acceptance</h1>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            Enter a Certificate ID to verify the acceptance record.
          </p>
        </div>

        <CardSection border={false} className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="cert-id" className="block text-xs font-medium text-gray-700 mb-1">
                Certificate ID
              </label>
              <input
                id="cert-id"
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="cert_01HX2K9A…"
                required
                className="block w-full rounded-lg border border-(--color-border) px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:border-transparent"
              />
            </div>
            <Button type="submit" variant="primary" size="lg" className="w-full">
              Verify
            </Button>
          </form>
        </CardSection>
      </Card>

      <p className="mt-5 text-xs text-(--color-text-muted) text-center max-w-xs">
        Certificates are cryptographically sealed. Verification is independent of OfferAccept — the hash is recomputed from the original acceptance record.
      </p>
    </div>
  );
}
