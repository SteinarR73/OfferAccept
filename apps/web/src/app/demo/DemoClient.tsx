'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Shield, CheckCircle2, FileText } from 'lucide-react';
import { track } from '@/lib/analytics';

// ─── Seeded demo data ─────────────────────────────────────────────────────────
// All fake — no API calls, no DB reads, no emails sent.

const DEMO = {
  senderName: 'Acme Corp',
  recipientEmail: 'you@example.com',
  documentTitle: 'Q1 2026 Consulting Proposal',
  acceptanceStatement:
    'I confirm that I have read and accept the attached document "Q1 2026 Consulting Proposal". I understand that this acceptance is recorded as evidence of my agreement to its terms.',
  certificateId: 'demo_cert_01JXYZ2K9ARST456UV',
  certificateHash: 'a3f1b9c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
  issuedAt: 'April 15, 2026 at 09:32 UTC',
  method: 'OTP-verified email',
  documents: [
    { name: 'Q1 2026 Consulting Proposal.pdf' },
    { name: 'Compensation Schedule.pdf' },
  ],
} as const;

type DemoStep = 'document' | 'otp' | 'statement' | 'certificate';

const STEP_ORDER: DemoStep[] = ['document', 'otp', 'statement', 'certificate'];
const STEP_LABELS: Record<DemoStep, string> = {
  document: 'Document',
  otp: 'Verify email',
  statement: 'Accept',
  certificate: 'Certificate',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DemoClient() {
  const [step, setStep] = useState<DemoStep>('document');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');

  useEffect(() => {
    track('demo.started', { locale: 'en' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp.trim())) {
      setOtpError('Enter any 6-digit number to continue the demo.');
      return;
    }
    setOtpError('');
    track('demo.otp_submitted', { locale: 'en' });
    setStep('statement');
  }

  function handleStatementAccept() {
    track('demo.statement_viewed', { locale: 'en' });
    setStep('certificate');
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="min-h-screen bg-(--color-bg) flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-(--color-border) bg-white px-6 py-3 flex items-center gap-2.5">
        <Shield className="w-5 h-5 text-(--color-accent)" aria-hidden="true" />
        <span className="font-semibold text-sm text-(--color-text-primary)">OfferAccept</span>
        <span className="text-(--color-border) select-none mx-1">·</span>
        <span className="text-sm text-(--color-text-secondary)">Live demonstration</span>
        <Link
          href="/"
          className="ml-auto text-xs text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
        >
          ← Back to site
        </Link>
      </header>

      {/* ── Demo banner ────────────────────────────────────────────────────── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center" role="status">
        <p className="text-xs text-amber-800 font-medium">
          Demonstration environment — no data is stored and no emails are sent.
        </p>
      </div>

      {/* ── Progress indicator ─────────────────────────────────────────────── */}
      <nav aria-label="Demo progress" className="bg-white border-b border-(--color-border-subtle) px-4 py-3">
        <ol className="max-w-xl mx-auto flex items-center justify-center gap-0">
          {STEP_ORDER.map((s, i) => {
            const isDone = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <li key={s} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`w-8 sm:w-12 h-px ${isDone ? 'bg-(--color-accent)' : 'bg-gray-200'}`}
                    aria-hidden="true"
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                      isDone
                        ? 'bg-(--color-accent) text-white'
                        : isCurrent
                        ? 'border-2 border-(--color-accent) text-(--color-accent) bg-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span
                    className={`text-[10px] font-medium whitespace-nowrap ${
                      isCurrent ? 'text-(--color-text-primary)' : 'text-(--color-text-muted)'
                    }`}
                  >
                    {STEP_LABELS[s]}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          {step === 'document'    && <DocumentStep    onContinue={() => setStep('otp')} />}
          {step === 'otp'        && <OtpStep         otp={otp} onChange={setOtp} error={otpError} onSubmit={handleOtpSubmit} />}
          {step === 'statement'  && <StatementStep   onAccept={handleStatementAccept} />}
          {step === 'certificate' && <CertificateStep />}
        </div>
      </main>
    </div>
  );
}

// ─── Step 1: Document view ────────────────────────────────────────────────────

function DocumentStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-8 pb-5">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-full bg-(--color-accent) flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            aria-hidden="true"
          >
            AC
          </div>
          <div>
            <p className="text-sm font-semibold text-(--color-text-primary)">{DEMO.senderName}</p>
            <p className="text-xs text-(--color-text-muted)">has shared a document with you</p>
          </div>
        </div>

        <h1 className="text-lg font-bold text-(--color-text-primary) mb-1">{DEMO.documentTitle}</h1>
        <p className="text-sm text-(--color-text-muted) mb-5">
          Review the documents below, then verify your email to confirm acceptance.
        </p>

        <div className="space-y-2 mb-6">
          {DEMO.documents.map((doc) => (
            <div
              key={doc.name}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-(--color-bg) border border-(--color-border-subtle)"
            >
              <div
                className="w-7 h-7 rounded bg-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0"
                aria-hidden="true"
              >
                PDF
              </div>
              <span className="text-sm text-(--color-text-secondary) truncate flex-1">{doc.name}</span>
              <span className="text-[10px] text-(--color-text-muted) bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
                Demo
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 px-4 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
          >
            Review &amp; accept →
          </button>
          <button
            type="button"
            disabled
            title="Not available in this demonstration"
            className="px-4 py-2.5 rounded-lg border border-(--color-border) text-sm text-(--color-text-muted) cursor-not-allowed opacity-60"
          >
            Decline
          </button>
        </div>
      </div>

      <div className="border-t border-(--color-border-subtle) px-6 py-3 bg-(--color-bg)">
        <p className="text-[11px] text-(--color-text-muted) text-center">
          Sent via <span className="font-medium">OfferAccept</span> · Acceptance is recorded and independently verifiable
        </p>
      </div>
    </div>
  );
}

// ─── Step 2: OTP verification ─────────────────────────────────────────────────

function OtpStep({
  otp,
  onChange,
  error,
  onSubmit,
}: {
  otp: string;
  onChange: (v: string) => void;
  error: string;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-8 pb-6">
        <div className="flex justify-center mb-5" aria-hidden="true">
          <div className="w-14 h-14 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
            <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        <h2 className="text-lg font-bold text-(--color-text-primary) text-center mb-1">Verify your email</h2>
        <p className="text-sm text-(--color-text-muted) text-center mb-5">
          A 6-digit code has been sent to{' '}
          <span className="font-medium text-(--color-text-secondary)">{DEMO.recipientEmail}</span>
        </p>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-5 text-center">
          <p className="text-xs text-amber-700">
            In this demo, any 6-digit number will be accepted.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="demo-otp" className="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
              6-digit verification code
            </label>
            <input
              id="demo-otp"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              autoComplete="one-time-code"
              className={`block w-full rounded-lg border px-3 py-2.5 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:border-transparent ${
                error ? 'border-red-400 bg-red-50' : 'border-(--color-border)'
              }`}
            />
            {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
          >
            Verify code →
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Step 3: Acceptance statement ─────────────────────────────────────────────

function StatementStep({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-white shadow-sm overflow-hidden">
      <div className="px-6 pt-8 pb-6">
        <h2 className="text-lg font-bold text-(--color-text-primary) mb-4">Accept this document</h2>

        <div className="rounded-xl bg-(--color-bg) border border-(--color-border-subtle) px-4 py-4 mb-5">
          <p className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wide mb-2">
            Acceptance statement
          </p>
          <p className="text-sm text-(--color-text-secondary) leading-relaxed">
            {DEMO.acceptanceStatement}
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {DEMO.documents.map((doc) => (
            <div
              key={doc.name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border border-(--color-border-subtle)"
            >
              <FileText className="w-4 h-4 text-(--color-text-muted) flex-shrink-0" aria-hidden="true" />
              <span className="text-xs text-(--color-text-secondary) truncate">{doc.name}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 px-4 py-2.5 rounded-lg bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-hover) transition-colors focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2"
          >
            Accept this document
          </button>
          <button
            type="button"
            disabled
            title="Not available in this demonstration"
            className="px-4 py-2.5 rounded-lg border border-(--color-border) text-sm text-(--color-text-muted) cursor-not-allowed opacity-60"
          >
            Decline
          </button>
        </div>

        <p className="text-[11px] text-(--color-text-muted) text-center mt-3">
          Accepting records your verified email, the exact document version, and timestamp.
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: Certificate ──────────────────────────────────────────────────────

function CertificateStep() {
  const certRows = [
    { label: 'Document',      value: DEMO.documentTitle,    mono: false },
    { label: 'Accepted by',   value: DEMO.recipientEmail,   mono: false },
    { label: 'Date',          value: DEMO.issuedAt,         mono: false },
    { label: 'Method',        value: DEMO.method,           mono: false },
    { label: 'Certificate',   value: DEMO.certificateId,    mono: true  },
    { label: 'SHA-256',       value: `${DEMO.certificateHash.slice(0, 24)}…`, mono: true },
  ] as const;

  return (
    <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-b from-green-50 to-white overflow-hidden shadow-sm">
      <div className="px-8 pt-10 pb-6 text-center">
        <div
          className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center ring-4 ring-green-200 shadow-lg shadow-green-200/60 mx-auto mb-4"
          aria-hidden="true"
        >
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-green-800 mb-2">Document accepted</h2>
        <p className="text-sm text-green-700 max-w-xs mx-auto">
          A tamper-evident acceptance certificate has been created.
        </p>
      </div>

      <div className="mx-6 mb-5 rounded-xl border border-green-200 bg-white/80 divide-y divide-green-100">
        {certRows.map(({ label, value, mono }) => (
          <div key={label} className="flex items-start gap-4 px-4 py-2.5">
            <span className="text-[11px] font-semibold text-green-600/70 uppercase tracking-wider w-24 flex-shrink-0 pt-0.5">
              {label}
            </span>
            <span className={`text-xs text-gray-800 break-all leading-relaxed ${mono ? 'font-mono' : 'font-medium'}`}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-6 mb-6">
        <Link
          href="/demo/verify"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
        >
          Verify this certificate →
        </Link>
        <Link
          href="/login?mode=signup"
          onClick={() => track('demo.signup_clicked', { locale: 'en' })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors"
        >
          Create your own account
        </Link>
      </div>

      <div className="border-t border-green-200 px-6 py-4 text-center bg-green-50/40">
        <p className="text-[11px] text-green-600/70">
          tamper-evident · cryptographically sealed · verifiable by any third party
        </p>
        <p className="text-xs text-amber-700 mt-1.5 font-medium">
          This is a demonstration certificate — no real data was stored.
        </p>
      </div>
    </div>
  );
}
