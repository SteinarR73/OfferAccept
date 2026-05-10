'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronUp,
  Lock,
  FileCheck,
  Mail,
  Database,
} from 'lucide-react';
import { verifyCertificate, type CertificateVerification, type CertificateMetadata } from '@/lib/offers-api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

// ─── Public certificate verification page ─────────────────────────────────────
// Accessible without authentication. Calls GET /certificates/:id/verify.

const VERIFY_TIMEOUT_MS = 5_000;

type PageState =
  | { phase: 'loading' }
  | { phase: 'valid'; result: CertificateVerification }
  | { phase: 'legacy'; result: CertificateVerification }
  | { phase: 'invalid'; result: CertificateVerification }
  | { phase: 'not-found' }
  | { phase: 'timeout' }
  | { phase: 'error'; message: string };

export default function CertificateVerifyPage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [state, setState] = useState<PageState>({ phase: 'loading' });
  const [showDetails, setShowDetails] = useState(false);

  function runVerification() {
    if (!certificateId) return;
    setState({ phase: 'loading' });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('__timeout__')), VERIFY_TIMEOUT_MS),
    );

    Promise.race([verifyCertificate(certificateId), timeout])
      .then((result) => {
        if (result.valid) {
          setState({ phase: 'valid', result });
        } else if (result.integrityChecksPass) {
          setState({ phase: 'legacy', result });
        } else {
          setState({ phase: 'invalid', result });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === '__timeout__') {
          setState({ phase: 'timeout' });
        } else if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
          setState({ phase: 'not-found' });
        } else {
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : 'Verification failed.',
          });
        }
      });
  }

  useEffect(() => { runVerification(); }, [certificateId]);

  return (
    <div className="min-h-screen bg-(--color-bg) flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-(--color-border) bg-white px-6 py-3 flex items-center gap-2.5">
        <Shield className="w-5 h-5 text-(--color-accent)" aria-hidden="true" />
        <span className="font-semibold text-sm text-(--color-text-primary)">OfferAccept</span>
        <span className="text-(--color-border) select-none">·</span>
        <span className="text-sm text-(--color-text-secondary)">Certificate verification</span>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-12 sm:py-18">
        <div className="w-full max-w-xl">
          {state.phase === 'loading' && <LoadingState />}
          {state.phase === 'valid' && (
            <ValidState
              result={state.result}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails((v) => !v)}
            />
          )}
          {state.phase === 'legacy' && (
            <LegacyState
              result={state.result}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails((v) => !v)}
            />
          )}
          {state.phase === 'invalid' && (
            <InvalidState
              result={state.result}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails((v) => !v)}
            />
          )}
          {state.phase === 'not-found' && <NotFoundState certificateId={certificateId} />}
          {state.phase === 'timeout'   && <TimeoutState onRetry={runVerification} />}
          {state.phase === 'error'     && <ErrorState message={state.message} onRetry={runVerification} />}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-(--color-border) bg-gray-50/60">
        <AboutCertificate
          metadata={
            state.phase === 'valid' || state.phase === 'legacy' || state.phase === 'invalid'
              ? state.result.metadata
              : undefined
          }
        />
        <p className="text-center text-xs text-(--color-text-muted) px-6 py-4">
          Certificates are cryptographically sealed and tamper-evident. This verification is
          performed server-side against the original signing record.
        </p>
      </footer>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-(--color-text-secondary)">
      <Spinner size="lg" />
      <p className="text-sm">Verifying certificate…</p>
    </div>
  );
}

// ── 4 validation checks (always visible) ─────────────────────────────────────

interface Check {
  icon: React.ReactNode;
  label: string;
  detail: string;
  ok: boolean;
}

function ValidationChecks({ result }: { result: CertificateVerification }) {
  const checks: Check[] = [
    {
      icon: <Lock className="w-4 h-4" aria-hidden="true" />,
      label: 'Certificate hash verified',
      detail: 'The SHA-256 hash of this record matches the stored certificate — it has not been altered.',
      ok: result.certificateHashMatch,
    },
    {
      icon: <FileCheck className="w-4 h-4" aria-hidden="true" />,
      label: 'Document integrity confirmed',
      detail: 'The document snapshot hash matches the files at the time of acceptance.',
      ok: result.snapshotIntegrity,
    },
    {
      icon: <Mail className="w-4 h-4" aria-hidden="true" />,
      label: 'Email verification recorded',
      detail: 'A one-time code confirmed the recipient controlled the email address used in this acceptance.',
      ok: result.eventChainIntegrity,
    },
    {
      icon: <Database className="w-4 h-4" aria-hidden="true" />,
      label: 'Immutable audit trail verified',
      detail: 'The acceptance event chain is intact — the audit log shows no gaps or modifications.',
      ok: result.integrityChecksPass,
    },
  ];

  return (
    <div className="divide-y divide-gray-100">
      {checks.map((c, i) => (
        <div key={i} className="flex items-start gap-3 py-3 px-4">
          <div className={`flex-shrink-0 mt-0.5 ${c.ok ? 'text-green-500' : 'text-red-500'}`}>
            {c.ok
              ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              : <XCircle className="w-4 h-4" aria-hidden="true" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{c.label}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                c.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {c.ok ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{c.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: NonNullable<CertificateVerification['summary']> }) {
  return (
    <div className="bg-white/70 rounded-xl border border-green-200 divide-y divide-green-100 mx-6 mb-5">
      <div className="flex justify-between items-start gap-3 px-4 py-2.5">
        <span className="text-xs text-green-700 font-semibold uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Document</span>
        <span className="text-sm font-semibold text-gray-900 text-right leading-snug">{summary.offerTitle}</span>
      </div>
      <div className="flex justify-between items-start gap-3 px-4 py-2.5">
        <span className="text-xs text-green-700 font-semibold uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Accepted by</span>
        <span className="text-xs text-gray-700 text-right font-mono break-all">{summary.recipientEmail}</span>
      </div>
      <div className="flex justify-between items-start gap-3 px-4 py-2.5">
        <span className="text-xs text-green-700 font-semibold uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">Accepted</span>
        <span className="text-xs text-gray-700 text-right">
          {new Date(summary.acceptedAt).toLocaleString(undefined, {
            month: 'long', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}

// ── How verification works ────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <div className="mx-6 mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
      <p className="text-xs font-semibold text-gray-700 mb-2.5">How verification works</p>
      <ul className="space-y-2">
        {[
          ['SHA-256 hash', 'The certificate is sealed with a cryptographic hash computed from the acceptance record. Any change to the record produces a different hash.'],
          ['Append-only records', 'Acceptance records cannot be deleted or modified — only new events can be appended.'],
          ['Independent verification', 'Anyone can verify this record using the certificate ID, with no account required.'],
          ['Immutable audit trail', 'The signing event chain records every step of the acceptance process.'],
        ].map(([title, desc]) => (
          <li key={title} className="flex gap-2.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-xs text-gray-600 leading-relaxed">
              <strong className="text-gray-800">{title}</strong> — {desc}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Subtle CTA ────────────────────────────────────────────────────────────────

function SubtleCta() {
  return (
    <div className="mx-6 mb-6 rounded-xl border border-gray-200 bg-white px-5 py-4 text-center">
      <p className="text-xs text-gray-500 mb-2">
        This acceptance record was created using OfferAccept.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-(--color-accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
      >
        Create your own acceptance record →
      </Link>
    </div>
  );
}

// ─── Valid state ──────────────────────────────────────────────────────────────

function ValidState({
  result,
  showDetails,
  onToggleDetails,
}: {
  result: CertificateVerification;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-green-300 bg-gradient-to-b from-green-50 to-white overflow-hidden shadow-sm">
      {/* ── Independence statement ───────────────────────────────────────────── */}
      <div className="bg-green-700 px-5 py-2.5 flex items-center justify-center gap-2">
        <Shield className="w-3.5 h-3.5 text-green-200 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs font-medium text-green-100 text-center">
          This verification is performed independently by OfferAccept against the original signing record. No account required.
        </p>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="px-8 pt-10 pb-6 text-center">
        <div
          className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center
                     ring-4 ring-green-200 shadow-lg shadow-green-200/60 mx-auto mb-4"
          aria-hidden="true"
        >
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-green-800 mb-2">Acceptance record verified</h1>
        <p className="text-sm text-green-700 max-w-xs mx-auto">
          This acceptance record has not been altered since it was issued.
        </p>
      </div>

      {/* ── 4 validation checks ──────────────────────────────────────────────── */}
      <div className="mx-6 mb-5 rounded-xl border border-green-200 bg-white/80 overflow-hidden">
        <ValidationChecks result={result} />
      </div>

      {/* ── Summary ──────────────────────────────────────────────────────────── */}
      {result.summary && <SummaryCard summary={result.summary} />}

      {/* ── Anomaly notice ───────────────────────────────────────────────────── */}
      {result.anomaliesDetected?.length > 0 && (
        <div className="mx-6 mb-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-800">
            Anomalies detected in the acceptance record. Contact the issuing organisation for clarification.
          </p>
        </div>
      )}

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <HowItWorks />

      {/* ── Technical details ────────────────────────────────────────────────── */}
      <div className="border-t border-green-200 px-6 py-3">
        <button
          type="button"
          onClick={onToggleDetails}
          className="w-full flex items-center justify-between text-xs text-green-700 hover:text-green-900 transition-colors py-0.5"
        >
          <span>Show cryptographic details</span>
          {showDetails
            ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
        {showDetails && (
          <div className="mt-4 space-y-4">
            <div className="divide-y divide-green-100 bg-white/60 rounded-xl border border-green-200">
              <HashRow label="Certificate ID" value={result.certificateId} />
              <HashRow label="Stored hash"    value={result.storedHash} />
              <HashRow label="Verified hash"  value={result.reconstructedHash} />
            </div>
            <div className="rounded-xl border border-green-100 overflow-hidden">
              <CheckRow label="Certificate hash match"   ok={result.certificateHashMatch} />
              <CheckRow label="Document snapshot integrity" ok={result.snapshotIntegrity} />
              <CheckRow label="Acceptance event chain"   ok={result.eventChainIntegrity} />
            </div>
          </div>
        )}
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────────────── */}
      <div className="border-t border-green-100 pt-4">
        <SubtleCta />
      </div>
    </div>
  );
}

// ─── Legacy state ─────────────────────────────────────────────────────────────

function LegacyState({
  result,
  showDetails,
  onToggleDetails,
}: {
  result: CertificateVerification;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-white overflow-hidden shadow-sm">
      <div className="px-8 pt-10 pb-6 text-center">
        <div
          className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center
                     ring-4 ring-amber-200 shadow-lg shadow-amber-200/60 mx-auto mb-4"
          aria-hidden="true"
        >
          <AlertTriangle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-amber-900 mb-2">Legacy certificate</h1>
        <p className="text-sm text-amber-800 font-medium mb-1">All available integrity checks passed.</p>
        <p className="text-sm text-amber-700 max-w-xs mx-auto">
          This certificate was issued before full canonical fingerprinting was introduced.
          Some modern verification guarantees are unavailable.
        </p>
      </div>

      <div className="mx-6 mb-5 rounded-xl border border-amber-200 bg-white/80 overflow-hidden">
        <ValidationChecks result={result} />
      </div>

      {result.summary && <SummaryCard summary={result.summary} />}

      <div className="mx-6 mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-800">
          The acceptance record has not been tampered with. However, the 5-field canonical
          fingerprint was not captured at issuance and cannot be independently verified.
        </p>
      </div>

      <HowItWorks />

      <div className="border-t border-amber-200 px-6 py-3">
        <button
          type="button"
          onClick={onToggleDetails}
          className="w-full flex items-center justify-between text-xs text-amber-700 hover:text-amber-900 transition-colors py-0.5"
        >
          <span>Show cryptographic details</span>
          {showDetails
            ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
        {showDetails && (
          <div className="mt-4 space-y-4">
            <div className="divide-y divide-amber-100 bg-white/60 rounded-xl border border-amber-200">
              <HashRow label="Certificate ID" value={result.certificateId} />
              <HashRow label="Stored hash"    value={result.storedHash} />
            </div>
            <div className="rounded-xl border border-amber-100 overflow-hidden">
              <CheckRow label="Certificate hash match"     ok={result.certificateHashMatch} />
              <CheckRow label="Document snapshot integrity" ok={result.snapshotIntegrity} />
              <CheckRow label="Acceptance event chain"     ok={result.eventChainIntegrity} />
            </div>
            {result.advisoryAnomalies?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Advisory notices</p>
                {result.advisoryAnomalies.map((a, i) => (
                  <p key={i} className="text-xs text-amber-800 mt-1">{a}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-amber-100 pt-4">
        <SubtleCta />
      </div>
    </div>
  );
}

// ─── Invalid state ────────────────────────────────────────────────────────────

function InvalidState({
  result,
  showDetails,
  onToggleDetails,
}: {
  result: CertificateVerification;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-red-300 bg-gradient-to-b from-red-50 to-white overflow-hidden shadow-sm">
      <div className="px-8 pt-10 pb-6 text-center">
        <div
          className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center
                     ring-4 ring-red-200 shadow-lg shadow-red-200/60 mx-auto mb-4"
          aria-hidden="true"
        >
          <XCircle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-red-800 mb-2">Verification failed</h1>
        <p className="text-sm text-red-800 font-medium mb-1">This acceptance record could not be verified.</p>
        <p className="text-sm text-red-700 max-w-xs mx-auto">
          The certificate may have been altered after it was issued. Do not rely on this record.
        </p>
      </div>

      <div className="mx-6 mb-5 rounded-xl border border-red-200 bg-white/80 overflow-hidden">
        <ValidationChecks result={result} />
      </div>

      <div className="mx-6 mb-5 rounded-lg border border-red-200 bg-red-50/40 px-4 py-3">
        <p className="text-xs text-red-800">
          If you believe this result is incorrect, contact{' '}
          <a href="mailto:support@offeraccept.com" className="font-medium underline hover:text-red-900">
            support@offeraccept.com
          </a>.
        </p>
      </div>

      <HowItWorks />

      <div className="border-t border-red-200 px-6 py-3">
        <button
          type="button"
          onClick={onToggleDetails}
          className="w-full flex items-center justify-between text-xs text-red-700 hover:text-red-900 transition-colors py-0.5"
        >
          <span>Show cryptographic details</span>
          {showDetails
            ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
        {showDetails && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-red-100 overflow-hidden">
              <CheckRow label="Certificate hash match"     ok={result.certificateHashMatch} />
              <CheckRow label="Document snapshot integrity" ok={result.snapshotIntegrity} />
              <CheckRow label="Acceptance event chain"     ok={result.eventChainIntegrity} />
            </div>
            <TechRow label="Stored hash"   value={result.storedHash} />
            <TechRow label="Computed hash" value={result.reconstructedHash} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Error states ─────────────────────────────────────────────────────────────

function NotFoundState({ certificateId }: { certificateId: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-white p-10 text-center shadow-sm">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5" aria-hidden="true">
        <Shield className="w-8 h-8 text-gray-400" />
      </div>
      <h1 className="text-xl font-bold text-(--color-text-primary) mb-2">Certificate not found</h1>
      <p className="text-sm text-(--color-text-secondary) max-w-xs mx-auto mb-6">
        No certificate exists for ID{' '}
        <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{certificateId}</code>.
        Double-check the link you were given.
      </p>
      <Link
        href="/verify"
        className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-(--color-border) bg-white text-sm font-medium text-(--color-text-primary) hover:bg-gray-50 transition-colors"
      >
        Try another Certificate ID
      </Link>
    </div>
  );
}

function TimeoutState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-10 text-center shadow-sm">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" aria-hidden="true" />
      <h1 className="text-xl font-bold text-amber-900 mb-2">Verification is taking longer than expected</h1>
      <p className="text-sm text-amber-800 max-w-xs mx-auto mb-6">Please try again.</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-10 text-center shadow-sm">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" aria-hidden="true" />
      <h1 className="text-xl font-bold text-amber-900 mb-2">Verification unavailable</h1>
      <p className="text-sm text-amber-800 max-w-xs mx-auto mb-1">{message}</p>
      <p className="text-xs text-amber-700 mb-6">Please try again in a moment.</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}

// ─── About / legal framework ──────────────────────────────────────────────────

function AboutCertificate({ metadata }: { metadata?: CertificateMetadata }) {
  const termsUrl = metadata?.termsVersionAtCreation
    ? `/legal/terms/v${metadata.termsVersionAtCreation}`
    : '/legal/terms';

  return (
    <>
      <div className="px-6 py-5 border-b border-(--color-border)">
        <p className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-3">
          Legal and verification framework
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            {
              href: '/security/evidence-model',
              label: 'Evidence model',
              badge: metadata?.evidenceModelVersion ? `v${metadata.evidenceModelVersion}` : undefined,
              desc: 'How the SHA-256 hash chain is constructed and how to verify independently',
            },
            {
              href: '/legal/acceptance-statement',
              label: 'Acceptance statement',
              badge: metadata?.acceptanceStatementVersion ? `v${metadata.acceptanceStatementVersion}` : undefined,
              desc: 'Exact wording shown to the recipient and eIDAS positioning',
            },
            {
              href: termsUrl,
              label: 'Terms of service',
              badge: metadata?.termsVersionAtCreation ? `v${metadata.termsVersionAtCreation}` : undefined,
              desc: 'Terms in effect when the sender created this offer',
            },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-1 rounded-lg border border-(--color-border) bg-white px-3 py-2.5 hover:border-(--color-accent)/40 hover:bg-blue-50/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium text-(--color-text-primary)">{item.label}</span>
                {item.badge && (
                  <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-(--color-text-muted) leading-relaxed">{item.desc}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        <p className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-3">
          Independent verification
        </p>
        <p className="text-xs text-(--color-text-secondary) mb-3 leading-relaxed">
          OfferAccept uses SHA-256 with a canonical payload. You can reproduce the hash
          independently using any standard tool — no account required.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/security/evidence-model#independent-verification"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-(--color-border) bg-white px-3 py-1.5 text-xs font-medium text-(--color-text-primary) hover:bg-gray-50 transition-colors"
          >
            Verification guide
          </a>
          <a
            href="/security/evidence-model"
            className="inline-flex items-center gap-1.5 rounded-md border border-(--color-border) bg-white px-3 py-1.5 text-xs font-medium text-(--color-text-primary) hover:bg-gray-50 transition-colors"
          >
            Evidence model
          </a>
        </div>
      </div>
    </>
  );
}

// ─── Primitive sub-components ─────────────────────────────────────────────────

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white/60">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" aria-hidden="true" />
        : <XCircle     className="w-4 h-4 text-red-500 flex-shrink-0"   aria-hidden="true" />}
      <span className="text-sm text-(--color-text-primary) flex-1">{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {ok ? 'PASS' : 'FAIL'}
      </span>
    </div>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-28 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-xs font-mono text-gray-800 break-all leading-relaxed">{value}</span>
    </div>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-xs font-mono text-gray-700 break-all bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
        {value}
      </p>
    </div>
  );
}
