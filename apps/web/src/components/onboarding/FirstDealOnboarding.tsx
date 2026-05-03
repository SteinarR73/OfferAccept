'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  currentStep: number;
  onStepChange: (step: number) => void;
  onDismiss: () => void;
  onTryYourself?: () => void;
}

const TOTAL_STEPS = 3;

// ─── FirstDealOnboarding ──────────────────────────────────────────────────────
// Full-screen modal with 3 educational panels shown to first-time users.
// Closes on Escape, backdrop click, or the X button.

export function FirstDealOnboarding({ currentStep, onStepChange, onDismiss, onTryYourself }: Props) {
  const router = useRouter();

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function goNext() {
    if (currentStep < TOTAL_STEPS) {
      onStepChange(currentStep + 1);
    } else {
      handleSendFirstDeal();
    }
  }

  function handleSendFirstDeal() {
    onDismiss();
    router.push('/dashboard/deals/new?firstDeal=true');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md bg-(--color-surface) rounded-2xl border border-(--color-border) shadow-2xl animate-fade-in">

        {/* Close button */}
        <button
          onClick={onDismiss}
          aria-label="Close onboarding"
          className="absolute top-4 right-4 p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Panel body */}
        <div className="px-7 pt-8 pb-4">
          {currentStep === 1 && <PanelWhatItDoes />}
          {currentStep === 2 && <PanelRecipientExperience />}
          {currentStep === 3 && <PanelCertificate />}
        </div>

        {/* Footer: CTA + progress dots */}
        <div className="px-7 pb-7 flex flex-col gap-4 pt-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={goNext}
            rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
          >
            {currentStep < TOTAL_STEPS ? 'Next' : 'Send my first deal'}
          </Button>

          {currentStep === TOTAL_STEPS && onTryYourself && (
            <button
              type="button"
              onClick={() => { onDismiss(); onTryYourself(); }}
              className="text-sm text-(--color-accent) hover:underline underline-offset-2 transition-colors text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
            >
              Or try it on yourself first →
            </button>
          )}

          <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Onboarding steps">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i + 1 === currentStep}
                aria-label={`Step ${i + 1} of ${TOTAL_STEPS}`}
                onClick={() => onStepChange(i + 1)}
                className={cn(
                  'h-2 rounded-full transition-all duration-200 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)',
                  i + 1 === currentStep
                    ? 'w-6 bg-(--color-accent)'
                    : 'w-2 bg-(--color-border) hover:bg-(--color-text-muted)',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panel 1: What it does ────────────────────────────────────────────────────

function PanelWhatItDoes() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-accent) mb-2">
          1 of 3
        </p>
        <h2
          id="onboarding-title"
          className="text-xl font-bold leading-snug text-(--color-text-primary)"
        >
          You send a link. They confirm.<br />You keep proof.
        </h2>
      </div>

      <p className="text-sm text-(--color-text-secondary) leading-relaxed">
        A timestamped, tamper-evident record that the right person accepted the right document.
        Takes under 60 seconds for your recipient.
      </p>

      <ul className="space-y-3">
        {STEPS.map(({ n, text }) => (
          <li key={n} className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full bg-(--color-accent) text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
              aria-hidden="true"
            >
              {n}
            </span>
            <span className="text-sm text-(--color-text-primary)">{text}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-(--color-text-muted) border-t border-(--color-border-subtle) pt-4">
        Your recipient needs no account and no software. The process takes under 60 seconds on their end.
      </p>
    </div>
  );
}

const STEPS = [
  { n: '1', text: 'Upload your document and name your deal' },
  { n: '2', text: 'Your recipient gets a secure email link' },
  { n: '3', text: 'They confirm — you get a certificate' },
];

// ─── Panel 2: Recipient experience ───────────────────────────────────────────

function PanelRecipientExperience() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-accent) mb-2">
          2 of 3
        </p>
        <h2
          id="onboarding-title"
          className="text-xl font-bold leading-snug text-(--color-text-primary)"
        >
          Your recipient just opens an email.
        </h2>
      </div>

      <p className="text-sm text-(--color-text-secondary) leading-relaxed">
        No passwords, no app downloads, no signing software. A straightforward secure
        web page that works on any device.
      </p>

      {/* Static browser mockup showing recipient experience */}
      <div className="rounded-xl border border-(--color-border) overflow-hidden text-left" aria-hidden="true">
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-(--color-bg) border-b border-(--color-border-subtle)">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="ml-2 text-[10px] text-(--color-text-muted) font-mono truncate">
            offeraccept.com/accept/oa_abc123…
          </span>
        </div>

        {/* Acceptance page preview */}
        <div className="p-4 space-y-3 bg-(--color-surface)">
          <p className="text-xs font-bold text-(--color-text-primary)">
            Acme Corp has sent you a deal
          </p>
          <p className="text-[11px] text-(--color-text-muted)">Senior Engineer — Q1 2026</p>

          {/* Document attachment */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-(--color-border-subtle) bg-(--color-bg)">
            <span className="w-6 h-6 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-red-600">PDF</span>
            </span>
            <span className="text-[11px] text-(--color-text-secondary)">Deal summary.pdf</span>
          </div>

          {/* CTA buttons */}
          <div className="flex gap-2 pt-1">
            <div className="flex-1 rounded-lg bg-(--color-accent) py-2 flex items-center justify-center">
              <span className="text-[11px] font-semibold text-white">Accept</span>
            </div>
            <div className="rounded-lg border border-(--color-border) px-3 py-2 flex items-center justify-center">
              <span className="text-[11px] text-(--color-text-muted)">Decline</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-(--color-text-muted)">
        The whole process takes your recipient under 60 seconds. They verify their email
        with a one-time code, then confirm.
      </p>
    </div>
  );
}

// ─── Panel 3: Certificate ─────────────────────────────────────────────────────

function PanelCertificate() {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-accent) mb-2">
          3 of 3
        </p>
        <h2
          id="onboarding-title"
          className="text-xl font-bold leading-snug text-(--color-text-primary)"
        >
          After they accept,<br />you get a certificate.
        </h2>
      </div>

      <p className="text-sm text-(--color-text-secondary) leading-relaxed">
        A tamper-evident acceptance certificate is generated automatically. It records
        who accepted, when, from which device, and which version of your document.
      </p>

      {/* Certificate preview card */}
      <div className="rounded-xl border-2 border-(--color-border) bg-(--color-bg) p-4" aria-hidden="true">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-(--color-text-primary) uppercase tracking-wider">
            Acceptance Certificate
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-(--color-success-light) text-(--color-success) font-semibold">
            Verified ✓
          </span>
        </div>
        <div className="space-y-2">
          {[
            { label: 'Accepted by',  value: 'jane.smith@acme.com' },
            { label: 'Document',     value: 'Deal summary.pdf'    },
            { label: 'Timestamp',    value: today                 },
            { label: 'Certificate',  value: 'SHA-256 hash stored' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] text-(--color-text-muted) font-medium whitespace-nowrap">
                {label}
              </span>
              <span className="text-[10px] text-(--color-text-secondary) font-mono truncate text-right">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-(--color-border-subtle) pt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold text-(--color-success-text) uppercase tracking-wide mb-1.5">
            Best for
          </p>
          <ul className="space-y-1">
            {['Offers', 'Approvals', 'Confirmations'].map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
                <span className="text-(--color-success)" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">
            Not for
          </p>
          <ul className="space-y-1">
            {['Formal legal signatures', 'Regulated e-signature requirements'].map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-xs text-(--color-text-secondary)">
                <span className="text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
