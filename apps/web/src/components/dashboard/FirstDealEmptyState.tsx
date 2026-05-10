'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, ArrowRight, FlaskConical } from 'lucide-react';
import { Button } from '../ui/Button';
import { TryYourselfModal } from './TryYourselfModal';
import { track } from '@/lib/analytics';

// ─── Locale strings ───────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    heading: 'See it before you send it.',
    body: 'Send a test to your own inbox — no document needed, takes under a minute.\nExperience exactly what your recipients see.',
    tryBtn: 'Try it yourself — 30 seconds',
    sendBtn: 'Send your first document',
    recipientNote: 'Recipients need no account — they accept via a secure email link.',
    steps: [
      {
        label: 'Add details',
        detail: "Name your document, attach a file, and enter your recipient's email.",
      },
      {
        label: 'Send it',
        detail: 'Your recipient receives a secure link — no account required on their end.',
      },
      {
        label: 'Get proof',
        detail: 'They confirm in under a minute. A tamper-evident certificate is issued instantly.',
      },
    ],
  },
  no: {
    heading: 'Se det før du sender det.',
    body: 'Send en test til din egen innboks — intet dokument nødvendig, tar under ett minutt.\nOpplev nøyaktig hva mottakerne dine ser.',
    tryBtn: 'Prøv det selv — 30 sekunder',
    sendBtn: 'Send ditt første dokument',
    recipientNote: 'Mottakere trenger ingen konto — de godkjenner via en sikker e-postlenke.',
    steps: [
      {
        label: 'Legg til detaljer',
        detail: 'Gi dokumentet et navn, legg ved en fil og skriv inn mottakerens e-post.',
      },
      {
        label: 'Send det',
        detail: 'Mottakeren din mottar en sikker lenke — ingen konto nødvendig på deres side.',
      },
      {
        label: 'Få bevis',
        detail: 'De bekrefter på under ett minutt. Et manipuleringssikkert sertifikat utstedes umiddelbart.',
      },
    ],
  },
} as const;

// ─── FirstDealEmptyState ──────────────────────────────────────────────────────
// Shown on the dashboard when the user has no deals.
// Primary: send a real deal via wizard.
// Secondary: "Try it yourself" — sends a test deal to the user's own email
// so they experience the full recipient flow before sending to a customer.

interface Props {
  locale?: 'en' | 'no';
}

export function FirstDealEmptyState({ locale = 'en' }: Props) {
  const [tryModalOpen, setTryModalOpen] = useState(false);
  const t = STRINGS[locale];

  return (
    <>
      {tryModalOpen && <TryYourselfModal onClose={() => setTryModalOpen(false)} />}

      <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-2xl bg-(--color-accent-light) border border-(--color-accent-light) flex items-center justify-center mb-6"
          aria-hidden="true"
        >
          <FileText className="w-8 h-8 text-(--color-accent)" />
        </div>

        {/* Heading */}
        <h2 className="text-xl font-bold tracking-tight text-(--color-text-primary) mb-2">
          {t.heading}
        </h2>
        <p className="text-sm text-(--color-text-secondary) max-w-sm mb-8 leading-relaxed whitespace-pre-line">
          {t.body}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              track('onboarding.try_yourself_clicked', { locale });
              setTryModalOpen(true);
            }}
            leftIcon={<FlaskConical className="w-4 h-4" aria-hidden="true" />}
          >
            {t.tryBtn}
          </Button>
          <Link href="/dashboard/deals/new?firstDeal=true">
            <Button
              variant="secondary"
              size="md"
              rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
              onClick={() => track('onboarding.send_first_clicked', { locale })}
            >
              {t.sendBtn}
            </Button>
          </Link>
        </div>

        {/* Recipient reassurance */}
        <p className="text-xs text-(--color-text-muted) mt-4 max-w-xs">{t.recipientNote}</p>

        {/* How it works — 3-step mini guide */}
        <div className="flex items-start gap-6 mt-12 max-w-lg text-left" aria-label="How it works">
          {t.steps.map((s, i) => (
            <div key={s.label} className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-5 h-5 rounded-full bg-(--color-accent) text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className="text-xs font-semibold text-(--color-text-primary)">{s.label}</span>
              </div>
              <p className="text-[11px] text-(--color-text-muted) leading-relaxed">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
