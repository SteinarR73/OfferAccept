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
} from 'lucide-react';
import { verifyCertificate, type CertificateVerification, type CertificateMetadata } from '@/lib/offers-api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

// ─── Public certificate verification page ─────────────────────────────────────
// Accessible without authentication. Calls GET /certificates/:id/verify.
// Shows valid/invalid/not-found states with hash details.

const VERIFY_TIMEOUT_MS = 5_000;

type PageState =
  | { phase: 'loading' }
  | { phase: 'valid'; result: CertificateVerification }
  // Crypto checks all pass but advisory anomalies exist (e.g. LEGACY_CERTIFICATE).
  // Shown in amber — not a green "valid" tick, but also not the red "tampered" state.
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
          // Crypto checks pass but advisory anomalies present (legacy cert, etc.)
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

  useEffect(() => {
    runVerification();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificateId]);

  return (
    <div className="min-h-screen bg-[--color-bg] flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-[--color-border] bg-white px-6 py-3 flex items-center gap-2.5">
        <Shield className="w-5 h-5 text-[--color-accent]" aria-hidden="true" />
        <span className="font-semibold text-sm text-[--color-text-primary]">OfferAccept</span>
        <span className="text-[--color-border] select-none">·</span>
        <span className="text-sm text-[--color-text-secondary]">Certificate verification</span>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-4 py-14 sm:py-20">
        <div className="w-full max-w-lg">
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
          {state.phase === 'timeout' && <TimeoutState onRetry={runVerification} />}
          {state.phase === 'error' && <ErrorState message={state.message} onRetry={runVerification} />}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[--color-border] bg-gray-50/60">
        <AboutCertificate
          metadata={
            state.phase === 'valid' || state.phase === 'legacy' || state.phase === 'invalid'
              ? state.result.metadata
              : undefined
          }
        />
        <p className="text-center text-xs text-[--color-text-muted] px-6 py-4">
          Certificates are cryptographically sealed and tamper-evident. This verification is
          performed server-side against the original signing record.
        </p>
      </footer>
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-[--color-text-secondary]">
      <Spinner size="lg" />
      <p className="text-sm">Verifying certificate…</p>
    </div>
  );
}

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
      {/* Header */}
      <div className="px-8 pt-10 pb-8 text-center">
        <div
          className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center
                     ring-4 ring-green-200 shadow-lg shadow-green-200/60 mx-auto mb-5"
          aria-hidden="true"
        >
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-green-800 mb-4">Certificate valid</h1>

        {/* Plain-language summary */}
        <div className="space-y-2 max-w-xs mx-auto">
          <p className="text-sm text-green-800 font-medium">
            This acceptance record has not been altered since it was issued.
          </p>
          <p className="text-sm text-green-700">
            The certificate hash matches the acceptance record. No alterations have been detected.
          </p>
        </div>
      </div>

      {result.anomaliesDetected?.length > 0 && (
        <div className="mx-6 mb-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-800">
            Anomalies detected in the acceptance record. Contact the issuing organisation for
            clarification.
          </p>
        </div>
      )}

      {/* Verification method explanation */}
      <VerificationExplanation tint="green" />

      {/* Technical details toggle */}
      <div className="border-t border-green-200 px-6 py-3">
        <button
          type="button"
          onClick={onToggleDetails}
          className="w-full flex items-center justify-between text-xs text-green-700 hover:text-green-900 transition-colors py-0.5"
        >
          <span>Show technical verification details</span>
          {showDetails
            ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
        {showDetails && (
          <div className="mt-4 space-y-4">
            <div className="divide-y divide-green-100 bg-white/60 rounded-xl border border-green-200">
              <HashRow label="Certificate ID" value={result.certificateId} />
              <HashRow label="Certificate hash" value={result.storedHash} />
            </div>
            <div>
              <CheckRow label="Certificate hash match" ok={result.certificateHashMatch} />
              <CheckRow label="Document snapshot integrity" ok={result.snapshotIntegrity} />
              <CheckRow label="Acceptance event chain" ok={result.eventChainIntegrity} />
            </div>
            <TechRow label="Verification hash" value={result.reconstructedHash} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Legacy certificate state ─────────────────────────────────────────────────
// Shown when integrityChecksPass=true but valid=false due to advisory anomalies
// (e.g. LEGACY_CERTIFICATE — certificate predates the canonical hash field).
// Displayed in amber: the crypto checks that DO exist all pass, but the certificate
// lacks modern full-fingerprint guarantees.
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
      <div className="px-8 pt-10 pb-8 text-center">
        <div
          className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center
                     ring-4 ring-amber-200 shadow-lg shadow-amber-200/60 mx-auto mb-5"
          aria-hidden="true"
        >
          <AlertTriangle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-amber-900 mb-4">Legacy certificate</h1>
        <div className="space-y-2 max-w-xs mx-auto">
          <p className="text-sm text-amber-800 font-medium">
            All available integrity checks passed.
          </p>
          <p className="text-sm text-amber-700">
            This certificate was issued before full canonical fingerprinting was introduced.
            Some modern verification guarantees are unavailable.
          </p>
        </div>
      </div>

      <div className="mx-6 mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-800">
          The acceptance record has not been tampered with. However, the 5-field canonical
          fingerprint (acceptedAt, dealId, ipAddress, recipientEmail, userAgent) was not
          captured at issuance and cannot be independently verified.
        </p>
      </div>

      <VerificationExplanation tint="amber" />

      <div className="border-t border-amber-200 px-6 py-3">
        <button
          type="button"
          onClick={onToggleDetails}
          className="w-full flex items-center justify-between text-xs text-amber-700 hover:text-amber-900 transition-colors py-0.5"
        >
          <span>Show technical verification details</span>
          {showDetails
            ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
        {showDetails && (
          <div className="mt-4 space-y-4">
            <div className="divide-y divide-amber-100 bg-white/60 rounded-xl border border-amber-200">
              <HashRow label="Certificate ID" value={result.certificateId} />
              <HashRow label="Certificate hash" value={result.storedHash} />
            </div>
            <div>
              <CheckRow label="Certificate hash match" ok={result.certificateHashMatch} />
              <CheckRow label="Document snapshot integrity" ok={result.snapshotIntegrity} />
              <CheckRow label="Acceptance event chain" ok={result.eventChainIntegrity} />
            </div>
            <TechRow label="Verification hash" value={result.reconstructedHash} />
            {result.advisoryAnomalies?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">
                  Advisory notices
                </p>
                {result.advisoryAnomalies.map((a, i) => (
                  <p key={i} className="text-xs text-amber-800 mt-1">{a}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
      {/* Header */}
      <div className="px-8 pt-10 pb-8 text-center">
        <div
          className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center
                     ring-4 ring-red-200 shadow-lg shadow-red-200/60 mx-auto mb-5"
          aria-hidden="true"
        >
          <XCircle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-red-800 mb-4">Verification failed</h1>

        {/* Plain-language summary */}
        <div className="space-y-2 max-w-xs mx-auto">
          <p className="text-sm text-red-800 font-medium">
            This acceptance record could not be verified.
          </p>
          <p className="text-sm text-red-700">
            The certificate may have been altered after it was issued. Do not rely on this record.
          </p>
        </div>
      </div>

      {/* Contact message */}
      <div className="mx-6 mb-5 rounded-lg border border-red-200 bg-red-50/40 px-4 py-3">
        <p className="text-xs text-red-800">
          If you believe this result is incorrect, contact{' '}
          <a href="mailto:support@offeraccept.com" className="font-medium underline hover:text-red-900">
            support@offeraccept.com
          </a>
          .
        </p>
      </div>

      {/* Verification method explanation */}
      <VerificationExplanation tint="red" />

      {/* Technical details toggle */}
      <div className="border-t border-red-200 px-6 py-3">
        <button
          type="button"
          onClick={onToggleDetails}
          className="w-full flex items-center justify-between text-xs text-red-700 hover:text-red-900 transition-colors py-0.5"
        >
          <span>Show technical verification details</span>
          {showDetails
            ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
        {showDetails && (
          <div className="mt-4 space-y-4">
            <div>
              <CheckRow label="Certificate hash match" ok={result.certificateHashMatch} />
              <CheckRow label="Document snapshot integrity" ok={result.snapshotIntegrity} />
              <CheckRow label="Acceptance event chain" ok={result.eventChainIntegrity} />
            </div>
            <TechRow label="Certificate hash" value={result.storedHash} />
            <TechRow label="Verification hash" value={result.reconstructedHash} />
          </div>
        )}
      </div>
    </div>
  );
}

// Shared explanation of how verification works — rendered in both ValidState and
// InvalidState above the technical toggle, below the plain-language summary.
function VerificationExplanation({ tint }: { tint: 'green' | 'red' | 'amber' }) {
  const colors =
    tint === 'green'
      ? 'border-green-200 bg-green-50/40 text-green-800'
      : tint === 'amber'
        ? 'border-amber-200 bg-amber-50/40 text-amber-800'
        : 'border-red-200 bg-red-50/40 text-red-800';

  return (
    <div className={`mx-6 mb-5 rounded-lg border px-4 py-3 ${colors}`}>
      <p className="text-xs leading-relaxed">
        Verification works by recomputing the SHA-256 hash of the stored acceptance record.
      </p>
      <p className="text-xs leading-relaxed mt-1">
        If the recomputed hash matches the certificate hash, the record has not been altered.
      </p>
    </div>
  );
}

function NotFoundState({ certificateId }: { certificateId: string }) {
  return (
    <div className="rounded-2xl border border-[--color-border] bg-white p-10 text-center shadow-sm">
      <div
        className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5"
        aria-hidden="true"
      >
        <Shield className="w-8 h-8 text-gray-400" />
      </div>
      <h1 className="text-xl font-bold text-[--color-text-primary] mb-2">Certificate not found</h1>
      <p className="text-sm text-[--color-text-secondary] max-w-xs mx-auto mb-6">
        No certificate exists for ID{' '}
        <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{certificateId}</code>.
        Double-check the link you were given.
      </p>
      <Link
        href="/verify"
        className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-[--color-border] bg-white text-sm font-medium text-[--color-text-primary] hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-[--color-accent] focus-visible:ring-offset-2"
      >
        Try another Certificate ID
      </Link>
      <p className="mt-3 text-xs text-[--color-text-muted]">
        Enter the certificate ID again to check a different record.
      </p>
    </div>
  );
}

function TimeoutState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-10 text-center shadow-sm">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" aria-hidden="true" />
      <h1 className="text-xl font-bold text-amber-900 mb-2">Verification is taking longer than expected</h1>
      <p className="text-sm text-amber-800 max-w-xs mx-auto mb-6">Please try again.</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
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
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// ─── About this certificate ───────────────────────────────────────────────────
// Shown below the verification result on all states.
// Links to the public documentation for the evidence model, acceptance statement,
// and OTP verification spec so relying parties can independently audit the model.
// When `metadata` is provided (from the verify API response), each card shows
// the actual governing document version rather than generic copy.

function AboutCertificate({ metadata }: { metadata?: CertificateMetadata }) {
  // Resolve the terms URL: if we have a specific version, link to the versioned page.
  const termsUrl = metadata?.termsVersionAtCreation
    ? `/legal/terms/v${metadata.termsVersionAtCreation}`
    : '/legal/terms';

  const evidenceModelUrl = metadata?.evidenceModelVersion
    ? `/security/evidence-model`
    : '/security/evidence-model';

  return (
    <div className="px-6 py-5 border-b border-[--color-border]">
      <p className="text-xs font-semibold text-[--color-text-muted] uppercase tracking-wider mb-3">
        Legal and verification framework
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <a
          href={evidenceModelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-1 rounded-lg border border-[--color-border] bg-white px-3 py-2.5 hover:border-[--color-accent]/40 hover:bg-blue-50/30 transition-colors"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium text-[--color-text-primary]">Evidence model</span>
            {metadata?.evidenceModelVersion && (
              <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                v{metadata.evidenceModelVersion}
              </span>
            )}
          </div>
          <span className="text-[--color-text-muted] leading-relaxed">
            How the SHA-256 hash chain is constructed and how to verify independently
          </span>
        </a>
        <a
          href="/legal/acceptance-statement"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-1 rounded-lg border border-[--color-border] bg-white px-3 py-2.5 hover:border-[--color-accent]/40 hover:bg-blue-50/30 transition-colors"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium text-[--color-text-primary]">Acceptance statement</span>
            {metadata?.acceptanceStatementVersion && (
              <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                v{metadata.acceptanceStatementVersion}
              </span>
            )}
          </div>
          <span className="text-[--color-text-muted] leading-relaxed">
            Exact wording shown to the recipient and eIDAS positioning
          </span>
        </a>
        <a
          href={termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-1 rounded-lg border border-[--color-border] bg-white px-3 py-2.5 hover:border-[--color-accent]/40 hover:bg-blue-50/30 transition-colors"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium text-[--color-text-primary]">Terms of service</span>
            {metadata?.termsVersionAtCreation && (
              <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                v{metadata.termsVersionAtCreation}
              </span>
            )}
          </div>
          <span className="text-[--color-text-muted] leading-relaxed">
            Terms in effect when the sender created this deal
          </span>
        </a>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" aria-hidden="true" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" aria-hidden="true" />
      )}
      <span className="text-sm text-[--color-text-primary]">{label}</span>
      <span
        className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
          ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}
      >
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
