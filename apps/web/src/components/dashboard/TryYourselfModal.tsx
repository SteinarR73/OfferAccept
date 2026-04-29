'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Send } from 'lucide-react';
import {
  createOffer,
  setRecipient,
  sendOffer,
  ApiError,
} from '../../lib/offers-api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert } from '../ui/Alert';

// ─── TryYourselfModal ──────────────────────────────────────────────────────────
// One-click activation path: creates a pre-configured test deal and sends it to
// the user's own email address. No wizard, no document required.
//
// Goal: user experiences the full recipient flow (link → OTP → accept → cert)
// in < 60 seconds, before they send to any real counterparty.

interface Props {
  onClose: () => void;
}

const DEFAULT_DEAL_NAME = 'Test acceptance — OfferAccept';

export function TryYourselfModal({ onClose }: Props) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [dealName, setDealName] = useState(DEFAULT_DEAL_NAME);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSend() {
    if (!emailValid) return;
    setLoading(true);
    setError(null);
    try {
      const { offerId } = await createOffer({ title: dealName.trim() || DEFAULT_DEAL_NAME });
      await setRecipient(offerId, { email: email.trim(), name: email.trim() });
      await sendOffer(offerId);
      onClose();
      router.push(`/dashboard/deals/${offerId}?sent=1`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not send the test deal. Please try again.',
      );
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="try-yourself-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm bg-(--color-surface) rounded-2xl border border-(--color-border) shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-accent) mb-1">
              Experience the full flow
            </p>
            <h2
              id="try-yourself-title"
              className="text-lg font-bold text-(--color-text-primary) leading-snug"
            >
              Send a test deal to yourself
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-4 p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-2 space-y-4">
          <p className="text-sm text-(--color-text-secondary) leading-relaxed">
            We&apos;ll send a deal to your own inbox. You&apos;ll see exactly what your
            recipients experience — the link, the OTP, the acceptance screen, and the
            certificate.
          </p>

          {error && (
            <Alert variant="error" dismissible onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Input
            label="Deal name"
            value={dealName}
            onChange={(e) => setDealName(e.target.value)}
            maxLength={200}
          />

          <Input
            label="Your email address"
            type="email"
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && emailValid) handleSend(); }}
            required
            autoFocus
            hint="You&apos;ll receive the acceptance link here. No document needed."
          />
        </div>

        {/* Footer */}
        <div className="px-6 pt-3 pb-6 flex flex-col gap-3">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            loading={loading}
            onClick={handleSend}
            disabled={!emailValid}
            leftIcon={<Send className="w-4 h-4" aria-hidden="true" />}
          >
            Send test deal
          </Button>
          <p className="text-[11px] text-(--color-text-muted) text-center leading-relaxed">
            Takes under 60 seconds on the recipient side.
            No document required for a test.
          </p>
        </div>
      </div>
    </div>
  );
}
