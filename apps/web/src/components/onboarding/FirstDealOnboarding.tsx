'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '@/lib/cn';
import { track } from '@/lib/analytics';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Panel1 {
  step: string;
  heading: string;
  body: string;
  steps: readonly string[];
  footer: string;
}

interface Panel2 {
  step: string;
  heading: string;
  body: string;
  mockupSender: string;
  mockupTitle: string;
  mockupFile: string;
  mockupAccept: string;
  mockupDecline: string;
  footer: string;
}

interface Panel3 {
  step: string;
  heading: string;
  body: string;
  certTitle: string;
  certVerified: string;
  certRows: readonly { label: string; value: string }[];
  bestFor: string;
  bestItems: readonly string[];
  notFor: string;
  notItems: readonly string[];
}

interface Props {
  currentStep: number;
  onStepChange: (step: number) => void;
  onDismiss: () => void;
  onTryYourself?: () => void;
  locale?: 'en' | 'no';
}

const TOTAL_STEPS = 3;

// ─── Locale strings ───────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    closeLabel: 'Close onboarding',
    nextBtn: 'Next',
    tryBtn: 'Try it yourself first — 30 seconds',
    skipBtn: 'Skip to sending a real document →',
    panel1: {
      step: '1 of 3',
      heading: 'You send a link. They confirm.\nYou keep proof.',
      body: 'A timestamped, tamper-evident record that the right person accepted the right document.',
      steps: [
        'Upload your document and give it a name',
        'Your recipient gets a secure email link',
        'They confirm — you get a certificate',
      ],
      footer: 'Your recipient needs no account and no software. The process takes under a minute on their end.',
    },
    panel2: {
      step: '2 of 3',
      heading: 'Your recipient just opens an email.',
      body: 'No passwords, no app downloads, no signing software. A straightforward secure web page that works on any device.',
      mockupSender: 'Acme Corp has sent you a document',
      mockupTitle: 'Senior Engineer — Q1 2026',
      mockupFile: 'Proposal summary.pdf',
      mockupAccept: 'Accept',
      mockupDecline: 'Decline',
      footer: 'The whole process takes your recipient under a minute. They verify their email with a one-time code, then confirm.',
    },
    panel3: {
      step: '3 of 3',
      heading: 'After they accept,\nyou get a certificate.',
      body: 'A tamper-evident acceptance certificate is generated automatically. It records who accepted, when, from which device, and which version of your document.',
      certTitle: 'Acceptance Certificate',
      certVerified: 'Verified ✓',
      certRows: [
        { label: 'Accepted by', value: 'jane.smith@acme.com' },
        { label: 'Document',    value: 'Proposal summary.pdf' },
        { label: 'Certificate', value: 'SHA-256 hash stored' },
      ],
      bestFor: 'Best for',
      bestItems: ['Offers', 'Approvals', 'Confirmations'],
      notFor: 'Not for',
      notItems: ['Formal legal signatures', 'Regulated e-signature requirements'],
    },
  },
  no: {
    closeLabel: 'Lukk introduksjonen',
    nextBtn: 'Neste',
    tryBtn: 'Prøv det selv — 30 sekunder',
    skipBtn: 'Gå videre til å sende et ekte dokument →',
    panel1: {
      step: '1 av 3',
      heading: 'Du sender en lenke. De bekrefter.\nDu beholder beviset.',
      body: 'Et tidsstemplet, manipuleringssikkert bevis på at riktig person godtok riktig dokument.',
      steps: [
        'Last opp dokumentet ditt og gi det et navn',
        'Mottakeren din får en sikker e-postlenke',
        'De bekrefter — du får et sertifikat',
      ],
      footer: 'Mottakeren trenger ingen konto og ingen programvare. Prosessen tar under ett minutt på deres side.',
    },
    panel2: {
      step: '2 av 3',
      heading: 'Mottakeren din åpner bare en e-post.',
      body: 'Ingen passord, ingen nedlastinger, ingen signeringsprogramvare. En enkel, sikker nettside som fungerer på alle enheter.',
      mockupSender: 'Acme AS har sendt deg et dokument',
      mockupTitle: 'Seniorkonsulent — Q1 2026',
      mockupFile: 'Tilbud.pdf',
      mockupAccept: 'Godkjenn',
      mockupDecline: 'Avslå',
      footer: 'Hele prosessen tar mottakeren under ett minutt. De bekrefter e-posten med en engangskode, deretter godkjenner de.',
    },
    panel3: {
      step: '3 av 3',
      heading: 'Etter at de godkjenner,\nfår du et akseptbevis.',
      body: 'Et manipuleringssikkert akseptbevis genereres automatisk. Det registrerer hvem som aksepterte, når, fra hvilken enhet og hvilken versjon av dokumentet ditt.',
      certTitle: 'Akseptbevis',
      certVerified: 'Bekreftet ✓',
      certRows: [
        { label: 'Godkjent av', value: 'kari.nordmann@firma.no' },
        { label: 'Dokument',    value: 'Tilbud.pdf' },
        { label: 'Bevis',       value: 'SHA-256-hash lagret' },
      ],
      bestFor: 'Passer til',
      bestItems: ['Tilbud', 'Godkjenninger', 'Bekreftelser'],
      notFor: 'Ikke for',
      notItems: ['Formelle juridiske signaturer', 'Regulerte e-signaturkrav'],
    },
  },
} as const;

// ─── FirstDealOnboarding ──────────────────────────────────────────────────────
// Full-screen modal with 3 educational panels shown to first-time users.
// Closes on Escape, backdrop click, or the X button.

export function FirstDealOnboarding({ currentStep, onStepChange, onDismiss, onTryYourself, locale = 'en' }: Props) {
  const router = useRouter();
  const t = STRINGS[locale];

  // Track modal shown on mount
  useEffect(() => {
    track('onboarding.modal_shown', { locale });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        track('onboarding.modal_dismissed', { locale, step: currentStep });
        onDismiss();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss, locale, currentStep]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function goNext() {
    if (currentStep < TOTAL_STEPS) {
      const next = currentStep + 1;
      track('onboarding.modal_step', { locale, step: next });
      onStepChange(next);
    } else {
      handleSendFirstDeal();
    }
  }

  function handleSendFirstDeal() {
    track('onboarding.send_first_clicked', { locale });
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
        onClick={() => {
          track('onboarding.modal_dismissed', { locale, step: currentStep });
          onDismiss();
        }}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md bg-(--color-surface) rounded-2xl border border-(--color-border) shadow-2xl animate-fade-in">

        {/* Close button */}
        <button
          type="button"
          onClick={() => {
            track('onboarding.modal_dismissed', { locale, step: currentStep });
            onDismiss();
          }}
          aria-label={t.closeLabel}
          className="absolute top-4 right-4 p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg) transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Panel body */}
        <div className="px-7 pt-8 pb-4">
          {currentStep === 1 && <PanelWhatItDoes t={t.panel1} />}
          {currentStep === 2 && <PanelRecipientExperience t={t.panel2} />}
          {currentStep === 3 && <PanelCertificate t={t.panel3} locale={locale} />}
        </div>

        {/* Footer: CTA + progress dots */}
        <div className="px-7 pb-7 flex flex-col gap-4 pt-2">
          {currentStep === TOTAL_STEPS && onTryYourself ? (
            <>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => {
                  track('onboarding.try_yourself_clicked', { locale });
                  onDismiss();
                  onTryYourself();
                }}
              >
                {t.tryBtn}
              </Button>
              <button
                type="button"
                onClick={handleSendFirstDeal}
                className="text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
              >
                {t.skipBtn}
              </button>
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={goNext}
              rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
            >
              {t.nextBtn}
            </Button>
          )}

          <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Onboarding steps">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i + 1 === currentStep ? 'true' : 'false'}
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

function PanelWhatItDoes({ t }: { t: Panel1 }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-accent) mb-2">
          {t.step}
        </p>
        <h2
          id="onboarding-title"
          className="text-xl font-bold leading-snug text-(--color-text-primary) whitespace-pre-line"
        >
          {t.heading}
        </h2>
      </div>

      <p className="text-sm text-(--color-text-secondary) leading-relaxed">{t.body}</p>

      <ul className="space-y-3">
        {t.steps.map((text, n) => (
          <li key={n} className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full bg-(--color-accent) text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
              aria-hidden="true"
            >
              {n + 1}
            </span>
            <span className="text-sm text-(--color-text-primary)">{text}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-(--color-text-muted) border-t border-(--color-border-subtle) pt-4">
        {t.footer}
      </p>
    </div>
  );
}

// ─── Panel 2: Recipient experience ───────────────────────────────────────────

function PanelRecipientExperience({ t }: { t: Panel2 }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-accent) mb-2">
          {t.step}
        </p>
        <h2
          id="onboarding-title"
          className="text-xl font-bold leading-snug text-(--color-text-primary)"
        >
          {t.heading}
        </h2>
      </div>

      <p className="text-sm text-(--color-text-secondary) leading-relaxed">{t.body}</p>

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
          <p className="text-xs font-bold text-(--color-text-primary)">{t.mockupSender}</p>
          <p className="text-[11px] text-(--color-text-muted)">{t.mockupTitle}</p>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-(--color-border-subtle) bg-(--color-bg)">
            <span className="w-6 h-6 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-red-600">PDF</span>
            </span>
            <span className="text-[11px] text-(--color-text-secondary)">{t.mockupFile}</span>
          </div>

          <div className="flex gap-2 pt-1">
            <div className="flex-1 rounded-lg bg-(--color-accent) py-2 flex items-center justify-center">
              <span className="text-[11px] font-semibold text-white">{t.mockupAccept}</span>
            </div>
            <div className="rounded-lg border border-(--color-border) px-3 py-2 flex items-center justify-center">
              <span className="text-[11px] text-(--color-text-muted)">{t.mockupDecline}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-(--color-text-muted)">{t.footer}</p>
    </div>
  );
}

// ─── Panel 3: Certificate ─────────────────────────────────────────────────────

function PanelCertificate({ t, locale }: { t: Panel3; locale: 'en' | 'no' }) {
  const today = new Date().toLocaleDateString(locale === 'no' ? 'nb-NO' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-(--color-accent) mb-2">
          {t.step}
        </p>
        <h2
          id="onboarding-title"
          className="text-xl font-bold leading-snug text-(--color-text-primary) whitespace-pre-line"
        >
          {t.heading}
        </h2>
      </div>

      <p className="text-sm text-(--color-text-secondary) leading-relaxed">{t.body}</p>

      {/* Certificate preview card */}
      <div className="rounded-xl border-2 border-(--color-border) bg-(--color-bg) p-4" aria-hidden="true">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-(--color-text-primary) uppercase tracking-wider">
            {t.certTitle}
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-(--color-success-light) text-(--color-success) font-semibold">
            {t.certVerified}
          </span>
        </div>
        <div className="space-y-2">
          {[...t.certRows, { label: locale === 'no' ? 'Tidspunkt' : 'Timestamp', value: today }].map(({ label, value }) => (
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
            {t.bestFor}
          </p>
          <ul className="space-y-1">
            {t.bestItems.map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
                <span className="text-(--color-success)" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">
            {t.notFor}
          </p>
          <ul className="space-y-1">
            {t.notItems.map((item) => (
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
