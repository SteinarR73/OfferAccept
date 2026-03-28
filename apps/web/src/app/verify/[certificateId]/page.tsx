'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { verifyCertificate, type CertificateVerification } from '@/lib/offers-api';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

// ─── Public certificate verification page ─────────────────────────────────────
// Accessible without authentication. Calls GET /certificates/:id/verify.
// Shows valid/invalid/not-found states with hash details.

type PageState =
  | { phase: 'loading' }
  | { phase: 'valid'; result: CertificateVerification }
  | { phase: 'invalid'; result: CertificateVerification }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string };

export default function CertificateVerifyPage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [state, setState] = useState<PageState>({ phase: 'loading' });
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!certificateId) return;
    verifyCertificate(certificateId)
      .then((result) => {
        setState({ phase: result.valid ? 'valid' : 'invalid', result });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
          setState({ phase: 'not-found' });
        } else {
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : 'Verification failed.',
          });
        }
      });
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
          {state.phase === 'invalid' && (
            <InvalidState
              result={state.result}
              showDetails={showDetails}
              onToggleDetails={() => setShowDetails((v) => !v)}
            />
          )}
          {state.phase === 'not-found' && <NotFoundState certificateId={certificateId} />}
          {state.phase === 'error' && <ErrorState message={state.message} />}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[--color-border] px-6 py-4 text-center text-xs text-[--color-text-muted]">
        Certificates are cryptographically sealed and tamper-evident. This verification is
        performed server-side against the original signing record.
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
            The deal was accepted and verified by OfferAccept.
          </p>
        </div>
      </div>

      {result.anomaliesDetected && (
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
function VerificationExplanation({ tint }: { tint: 'green' | 'red' }) {
  const colors =
    tint === 'green'
      ? 'border-green-200 bg-green-50/40 text-green-800'
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
      <Button variant="secondary" size="sm" onClick={() => history.back()}>
        Go back
      </Button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-10 text-center shadow-sm">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" aria-hidden="true" />
      <h1 className="text-xl font-bold text-amber-900 mb-2">Verification unavailable</h1>
      <p className="text-sm text-amber-800 max-w-xs mx-auto mb-1">{message}</p>
      <p className="text-xs text-amber-700 mb-6">Please try again in a moment.</p>
      <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
        Retry
      </Button>
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
