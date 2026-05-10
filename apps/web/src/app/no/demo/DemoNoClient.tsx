'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Shield, CheckCircle2, FileText, Lock } from 'lucide-react';
import { track } from '@/lib/analytics';

// ─── Seeded demo data — Norwegian ─────────────────────────────────────────────
// Alle data er fiktive — ingen API-kall, ingen databaselesinger, ingen e-poster sendes.

const DEMO = {
  senderName: 'Acme AS',
  recipientEmail: 'deg@eksempel.no',
  documentTitle: 'Konsulentavtale Q2 2026',
  acceptanceStatement:
    'Jeg bekrefter at jeg har lest og godtar det vedlagte dokumentet «Konsulentavtale Q2 2026». Jeg forstår at denne bekreftelsen registreres som bevis på min aksept av vilkårene.',
  certificateId: 'demo_cert_01JXYZ2K9ARST456UV',
  certificateHash: 'a3f1b9c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
  issuedAt: '15. april 2026 kl. 09:32 UTC',
  method: 'OTP-bekreftet e-post',
  documents: [
    { name: 'Konsulentavtale Q2 2026.pdf' },
    { name: 'Honorarplan.pdf' },
  ],
} as const;

type DemoStep = 'document' | 'otp' | 'statement' | 'certificate';

const STEP_ORDER: DemoStep[] = ['document', 'otp', 'statement', 'certificate'];
const STEP_LABELS: Record<DemoStep, string> = {
  document: 'Dokument',
  otp: 'Bekreft e-post',
  statement: 'Godkjenn',
  certificate: 'Bevis',
};

// ─── Demo ─────────────────────────────────────────────────────────────────────

export function DemoNoClient() {
  const [step, setStep] = useState<DemoStep>('document');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');

  // Track demo start once
  useEffect(() => {
    track('demo.started', { locale: 'no' });
  }, []);

  function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp.trim())) {
      setOtpError('Skriv inn et hvilket som helst 6-sifret tall for å fortsette demoen.');
      return;
    }
    setOtpError('');
    track('demo.otp_submitted', { locale: 'no' });
    setStep('statement');
  }

  function handleStatementView() {
    track('demo.statement_viewed', { locale: 'no' });
    setStep('certificate');
  }

  function handleSignupClick() {
    track('demo.signup_clicked', { locale: 'no' });
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="min-h-screen bg-(--color-bg) flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-(--color-border) bg-white px-6 py-3 flex items-center gap-2.5">
        <Shield className="w-5 h-5 text-(--color-accent)" aria-hidden="true" />
        <span className="font-semibold text-sm text-(--color-text-primary)">OfferAccept</span>
        <span className="text-(--color-border) select-none mx-1">·</span>
        <span className="text-sm text-(--color-text-secondary)">Live demonstrasjon</span>
        <Link
          href="/no/landing"
          className="ml-auto text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
        >
          ← Tilbake til siden
        </Link>
      </header>

      {/* ── Demo banner ────────────────────────────────────────────────────── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center" role="status">
        <p className="text-xs text-amber-800 font-medium">
          Demonstrasjonsmiljø — ingen data lagres og ingen e-poster sendes.
        </p>
      </div>

      {/* ── Progress indicator ─────────────────────────────────────────────── */}
      <nav aria-label="Demo-fremgang" className="bg-white border-b border-(--color-border-subtle) px-4 py-3">
        <ol className="flex items-center justify-center gap-1 max-w-md mx-auto">
          {STEP_ORDER.map((s, i) => {
            const isActive = s === step;
            const isDone = i < stepIndex;
            return (
              <li key={s} className="flex items-center">
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    isActive
                      ? 'bg-(--color-accent) text-white'
                      : isDone
                        ? 'bg-green-100 text-green-700'
                        : 'text-(--color-text-muted)'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {isDone ? '✓ ' : ''}{STEP_LABELS[s]}
                </span>
                {i < STEP_ORDER.length - 1 && (
                  <span className="mx-1 text-(--color-border)" aria-hidden="true">›</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-xl">

          {step === 'document' && (
            <DocumentStep onContinue={() => setStep('otp')} />
          )}

          {step === 'otp' && (
            <OtpStep
              otp={otp}
              otpError={otpError}
              onChange={setOtp}
              onSubmit={handleOtpSubmit}
            />
          )}

          {step === 'statement' && (
            <StatementStep onAccept={handleStatementView} />
          )}

          {step === 'certificate' && (
            <CertificateStep onSignup={handleSignupClick} />
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Step: Document ────────────────────────────────────────────────────────────

function DocumentStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-5">
      {/* Sender identity */}
      <div>
        <p className="text-xs text-(--color-text-muted) uppercase tracking-wider mb-1">Sendt av</p>
        <h1 className="text-xl font-bold text-(--color-text-primary)">{DEMO.senderName}</h1>
        <p className="font-serif text-2xl text-(--color-text-secondary) mt-0.5">{DEMO.documentTitle}</p>
      </div>

      {/* Documents */}
      <div>
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Vedlagte dokumenter ({DEMO.documents.length})
        </p>
        <ul className="space-y-2">
          {DEMO.documents.map((doc) => (
            <li
              key={doc.name}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-(--color-border) bg-(--color-surface)"
            >
              <div className="w-8 h-8 rounded bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-red-500" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-(--color-text-primary) truncate">{doc.name}</p>
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  Demo
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Platform trust box */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-600 leading-relaxed">
          Dette dokumentet ble delt via <span className="font-semibold text-gray-900">OfferAccept</span>,
          som registrerer et bekreftet akseptbevis når du godkjenner.
          Ingen konto nødvendig.
        </p>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors"
        >
          <Shield className="w-4 h-4" aria-hidden="true" />
          Fortsett til godkjenning
        </button>
        <button
          type="button"
          disabled
          title="Ikke tilgjengelig i denne demonstrasjonen"
          className="px-4 py-2.5 rounded-lg border border-(--color-border) text-sm text-(--color-text-muted) opacity-60 cursor-not-allowed"
        >
          Avslå
        </button>
      </div>
    </div>
  );
}

// ─── Step: OTP ─────────────────────────────────────────────────────────────────

function OtpStep({
  otp,
  otpError,
  onChange,
  onSubmit,
}: {
  otp: string;
  otpError: string;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) overflow-hidden">
      <div className="px-6 py-4 border-b border-(--color-border-subtle)">
        <h2 className="text-base font-semibold text-(--color-text-primary)">Bekreft e-postadressen din</h2>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Article 14 GDPR notice */}
        <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-bg) px-4 py-3">
          <p className="text-xs font-semibold text-(--color-text-primary) mb-1.5">
            Slik brukes informasjonen din
          </p>
          <p className="text-xs text-(--color-text-secondary) mb-1.5">
            <span className="font-medium">{DEMO.senderName}</span> delte dette dokumentet via OfferAccept.
          </p>
          <p className="text-xs text-(--color-text-secondary) mb-1">
            Hvis du bekrefter aksept, registrerer vi:
          </p>
          <ul className="text-xs text-(--color-text-muted) space-y-0.5 mb-2 pl-1">
            <li>· e-postadresse</li>
            <li>· tidspunkt for bekreftelse</li>
            <li>· enhetsinformasjon</li>
          </ul>
          <p className="text-xs text-(--color-text-secondary)">
            Dette oppretter et etterprøvbart akseptbevis. Grunnlaget for behandlingen er berettiget interesse.
          </p>
        </div>

        <p className="text-sm text-(--color-text-secondary)">
          En 6-sifret kode ble sendt til{' '}
          <strong className="text-gray-900">{DEMO.recipientEmail}</strong>.
        </p>

        {/* Demo hint */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Demo:</span> Skriv inn et hvilket som helst 6-sifret tall — ingen ekte kode sendes.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="demo-otp" className="block text-xs font-medium text-gray-700 mb-1">
              Verifiseringskode
            </label>
            <div className="flex items-end gap-3">
              <input
                id="demo-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                autoComplete="one-time-code"
                placeholder="——————"
                className="block w-36 rounded-lg border border-(--color-border) px-3 py-2.5 text-center text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:border-transparent"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors"
              >
                Bekreft
              </button>
            </div>
            {otpError && (
              <p className="mt-2 text-sm text-red-600">{otpError}</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Step: Statement ───────────────────────────────────────────────────────────

function StatementStep({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-(--color-text-primary) mb-1">Bekreft dette dokumentet</h2>
        <p className="text-sm text-(--color-text-secondary)">Du bekrefter følgende:</p>
      </div>

      {/* Acceptance statement */}
      <blockquote className="border-l-4 border-(--color-accent) bg-(--color-accent-soft) px-5 py-4 rounded-r-xl">
        <p className="text-sm text-(--color-text-primary) italic leading-relaxed">
          {DEMO.acceptanceStatement}
        </p>
      </blockquote>

      {/* Document list */}
      <div>
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Dokumenter i denne aksepten</p>
        <ul className="space-y-1.5">
          {DEMO.documents.map((doc) => (
            <li key={doc.name} className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
              <FileText className="w-4 h-4 text-(--color-text-muted) flex-shrink-0" aria-hidden="true" />
              {doc.name}
            </li>
          ))}
        </ul>
      </div>

      {/* Legal disclosure */}
      <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-bg) px-4 py-4">
        <p className="text-sm font-medium text-(--color-text-primary) mb-2">
          Ved å klikke Godkjenn bekrefter du at:
        </p>
        <ul className="space-y-1.5 mb-3">
          {[
            'du er den tiltenkte mottakeren av dette dokumentet',
            'du har lest og forstått dokumentet som vises her',
            'du godkjenner dokumentet i den form det er presentert',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-(--color-text-secondary)">
              <span className="mt-1 w-1 h-1 rounded-full bg-(--color-accent) flex-shrink-0" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs text-(--color-text-muted) leading-relaxed">
          Denne bekreftelsen registrerer akseptbevis. Det er ikke en kvalifisert elektronisk signatur
          i henhold til EU-forordning nr. 910/2014 (eIDAS).
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          Godkjenn
        </button>
        <button
          type="button"
          disabled
          title="Ikke tilgjengelig i denne demonstrasjonen"
          className="px-4 py-2.5 rounded-lg border border-(--color-border) text-sm text-(--color-text-muted) opacity-60 cursor-not-allowed"
        >
          Avslå
        </button>
      </div>
    </div>
  );
}

// ─── Step: Certificate ─────────────────────────────────────────────────────────

function CertificateStep({ onSignup }: { onSignup: () => void }) {
  return (
    <div className="space-y-5">
      {/* Success hero */}
      <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-b from-green-50 to-white overflow-hidden shadow-sm">
        <div className="px-8 pt-8 pb-5 text-center">
          <div
            className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center ring-4 ring-green-200 shadow-lg shadow-green-200/60 mx-auto mb-4"
            aria-hidden="true"
          >
            <CheckCircle2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-green-800 mb-2">Bekreftet. Beviset er sikret.</h1>
          <p className="text-sm text-green-700 max-w-xs mx-auto">
            Din bekreftelse er registrert og kan ikke endres i ettertid.
          </p>
        </div>

        {/* Certificate details */}
        <div className="bg-white/70 rounded-xl border border-green-200 divide-y divide-green-100 mx-6 mb-5">
          {[
            { label: 'Dokument', value: DEMO.documentTitle },
            { label: 'Bekreftet av', value: DEMO.recipientEmail },
            { label: 'Tidspunkt', value: DEMO.issuedAt },
            { label: 'Metode', value: DEMO.method },
            { label: 'SHA-256', value: DEMO.certificateHash.slice(0, 20) + '…' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-start gap-3 px-4 py-2.5">
              <span className="text-xs text-green-700 font-semibold uppercase tracking-wider w-28 flex-shrink-0 pt-0.5">
                {label}
              </span>
              <span className="text-sm font-medium text-gray-900 text-right leading-snug font-mono text-xs">
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* What was recorded */}
        <div className="mx-6 mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Hva ble registrert?</p>
          <ul className="space-y-1.5">
            {[
              'Det godkjente dokumentet og alle vedlegg',
              'Tidspunkt for aksept (med tidssone)',
              'Et kryptografisk SHA-256-fingeravtrykk',
              'OTP-bekreftelse av e-postadressen',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="border-t border-green-100 px-6 py-5 text-center">
          <p className="text-xs text-amber-700 font-medium mb-3">
            Dette er en demonstrasjon — ingen ekte data ble lagret.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login?mode=signup"
              onClick={onSignup}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors"
            >
              Opprett din første aksept →
            </Link>
            <Link
              href="/verify"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-(--color-border) text-sm text-(--color-text-secondary) hover:bg-gray-50 transition-colors"
              onClick={() => track('demo.verify_clicked', { locale: 'no' })}
            >
              Verifiser et ekte bevis
            </Link>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-(--color-text-muted) flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        Bekreftet med OTP · SHA-256-forseglet · Revisjonslogg bevart
      </p>
    </div>
  );
}
