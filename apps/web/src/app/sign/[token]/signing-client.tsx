'use client';

import { useEffect, useReducer, useRef } from 'react';
import { CheckCircle, XCircle, Shield } from 'lucide-react';
import { signingApi, OfferContext, OtpResult, ApiError } from '@/lib/signing-api';
import { SpinnerPage } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardSection, CardFooter } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { DocumentPreviewCard } from '@/components/sign/DocumentPreviewCard';

// ─── State machine ─────────────────────────────────────────────────────────────
//
// The UI state machine mirrors the server-side session states but is independent.
// It drives what the user sees. Transitions are only triggered by explicit user
// actions or by API responses — never auto-advanced on timer or page load OTP.
//
// States:
//   loading          → fetching offer context on mount
//   invalid_link     → token not found / expired / revoked (404)
//   offer_expired    → offer.expiresAt has passed (410 OFFER_EXPIRED)
//   already_terminal → offer was already accepted/declined/revoked (404 or 410)
//   offer_view       → recipient is reading the offer (main "read-first" state)
//   otp_requesting   → async: waiting for OTP to be sent after user clicks "Continue"
//   otp_entry        → recipient entering the 6-digit code
//   otp_verifying    → async: waiting for server to confirm the code
//   otp_error        → wrong code; shows remaining attempts or lock message
//   acceptance       → OTP verified; showing acceptance statement + confirm button
//   accepting        → async: submitting final acceptance
//   completed        → acceptance confirmed
//   declined         → recipient declined the offer

type Phase =
  | { name: 'loading' }
  | { name: 'invalid_link' }
  | { name: 'offer_expired'; expiresAt: string | null }
  | { name: 'already_terminal'; reason: string }
  | { name: 'offer_view'; ctx: OfferContext; declineError?: string }
  // prevOtp is set when this is a resend request from the OTP screen.
  // It lets OTP_SEND_FAILED return to otp_entry (with the still-valid old OTP)
  // rather than dropping the user back to offer_view.
  | { name: 'otp_requesting'; ctx: OfferContext; prevOtp?: OtpResult }
  | { name: 'otp_entry'; ctx: OfferContext; otp: OtpResult; error?: string }
  | { name: 'otp_verifying'; ctx: OfferContext; otp: OtpResult }
  | { name: 'otp_error'; ctx: OfferContext; otp: OtpResult; message: string; locked: boolean; expired: boolean }
  | { name: 'acceptance'; ctx: OfferContext; challengeId: string }
  | { name: 'accepting'; ctx: OfferContext }
  | { name: 'completed'; acceptedAt: string; certificateId: string | null }
  | { name: 'declined' };

type Action =
  | { type: 'CONTEXT_LOADED'; ctx: OfferContext }
  | { type: 'LOAD_FAILED'; code: string; expiresAt?: string }
  | { type: 'CONTINUE_TO_OTP' }
  | { type: 'OTP_SENT'; otp: OtpResult }
  | { type: 'OTP_SEND_FAILED'; message: string }
  | { type: 'SUBMIT_CODE'; code: string }
  | { type: 'OTP_VERIFIED'; challengeId: string }
  | { type: 'OTP_FAILED'; message: string; locked: boolean; expired: boolean }
  | { type: 'CONFIRM_ACCEPT' }
  | { type: 'ACCEPTED'; acceptedAt: string; certificateId: string | null }
  | { type: 'ACCEPT_FAILED'; message: string }
  | { type: 'DECLINE' }
  | { type: 'DECLINED' }
  | { type: 'DECLINE_FAILED'; message: string };

// Exported for unit testing — pure function, no side effects.
export function reducer(state: Phase, action: Action): Phase {
  switch (action.type) {
    case 'CONTEXT_LOADED':
      return { name: 'offer_view', ctx: action.ctx };

    case 'LOAD_FAILED':
      if (action.code === 'OFFER_EXPIRED')
        return { name: 'offer_expired', expiresAt: action.expiresAt ?? null };
      if (action.code === 'OFFER_ALREADY_ACCEPTED' || action.code === 'INVALID_STATE_TRANSITION')
        return { name: 'already_terminal', reason: action.code };
      return { name: 'invalid_link' };

    case 'CONTINUE_TO_OTP':
      // Initial flow (offer_view → requesting) has no prevOtp.
      if (state.name === 'offer_view')
        return { name: 'otp_requesting', ctx: state.ctx };
      // Resend flow (otp_entry / otp_error → requesting): preserve the old OTP so
      // that if the resend request itself fails, we can return here with an error
      // instead of silently dropping the user back to the start.
      if (state.name === 'otp_entry' || state.name === 'otp_error')
        return { name: 'otp_requesting', ctx: state.ctx, prevOtp: state.otp };
      return state;

    case 'OTP_SENT':
      // Always arrives via otp_requesting — both initial and resend paths now
      // transition through otp_requesting before showing the entry screen.
      if (state.name !== 'otp_requesting') return state;
      return { name: 'otp_entry', ctx: state.ctx, otp: action.otp };

    case 'OTP_SEND_FAILED':
      if (state.name !== 'otp_requesting') return state;
      // Resend path: prevOtp is set — stay on the OTP screen, restore the old
      // challenge, and show the error so the recipient knows what went wrong.
      if (state.prevOtp) {
        return { name: 'otp_entry', ctx: state.ctx, otp: state.prevOtp, error: action.message };
      }
      // Initial path: no OTP challenge yet — go back to the offer view.
      return { name: 'offer_view', ctx: state.ctx };

    case 'SUBMIT_CODE':
      if (state.name !== 'otp_entry') return state;
      return { name: 'otp_verifying', ctx: state.ctx, otp: state.otp };

    case 'OTP_VERIFIED':
      if (state.name !== 'otp_verifying') return state;
      return { name: 'acceptance', ctx: state.ctx, challengeId: action.challengeId };

    case 'OTP_FAILED':
      if (state.name !== 'otp_verifying') return state;
      return { name: 'otp_error', ctx: state.ctx, otp: state.otp, message: action.message, locked: action.locked, expired: action.expired };

    case 'CONFIRM_ACCEPT':
      if (state.name !== 'acceptance') return state;
      return { name: 'accepting', ctx: state.ctx };

    case 'ACCEPTED':
      return { name: 'completed', acceptedAt: action.acceptedAt, certificateId: action.certificateId };

    case 'ACCEPT_FAILED':
      if (state.name !== 'accepting') return state;
      return { name: 'offer_view', ctx: state.ctx };

    case 'DECLINE':
      if (state.name !== 'offer_view' && state.name !== 'otp_entry' && state.name !== 'acceptance')
        return state;
      return { name: 'accepting', ctx: (state as { ctx: OfferContext }).ctx };

    case 'DECLINED':
      return { name: 'declined' };

    case 'DECLINE_FAILED':
      // API call failed — return to offer_view with an error message so the
      // recipient knows the decline was NOT recorded and can try again.
      // Never show the "declined" success screen when the server call failed.
      if (state.name !== 'accepting' && state.name !== 'offer_view') return state;
      return {
        name: 'offer_view',
        ctx: (state as { ctx: OfferContext }).ctx,
        declineError: action.message,
      };

    default:
      return state;
  }
}

// Export types for unit tests.
export type { Phase, Action };

// ─── Trust banner ──────────────────────────────────────────────────────────────

function TrustBanner({ sessionId }: { sessionId?: string }) {
  return (
    <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center justify-center gap-4 text-xs text-green-800">
      <span className="flex items-center gap-1">
        🔒 Secure acceptance session
      </span>
      {sessionId && (
        <span className="font-mono opacity-70 hidden sm:inline">ID: {sessionId.slice(0, 12)}…</span>
      )}
      <span className="text-green-600">· Encrypted in transit (TLS)</span>
    </div>
  );
}

// ─── SigningClient ─────────────────────────────────────────────────────────────

export function SigningClient({ token }: { token: string }) {
  const [phase, dispatch] = useReducer(reducer, { name: 'loading' });
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    signingApi.getContext(token).then(
      (ctx) => dispatch({ type: 'CONTEXT_LOADED', ctx }),
      (err: ApiError) =>
        dispatch({ type: 'LOAD_FAILED', code: err.code, expiresAt: undefined }),
    );
  }, [token]);

  async function handleContinue() {
    dispatch({ type: 'CONTINUE_TO_OTP' });
    try {
      const otp = await signingApi.requestOtp(token);
      dispatch({ type: 'OTP_SENT', otp });
    } catch (err) {
      dispatch({ type: 'OTP_SEND_FAILED', message: (err as ApiError).message });
    }
  }

  async function handleVerifyCode(otp: OtpResult) {
    const code = codeRef.current?.value?.trim() ?? '';
    if (!/^\d{6}$/.test(code)) return;

    dispatch({ type: 'SUBMIT_CODE', code });
    try {
      await signingApi.verifyOtp(token, otp.challengeId, code);
      dispatch({ type: 'OTP_VERIFIED', challengeId: otp.challengeId });
    } catch (err) {
      const e = err as ApiError;
      dispatch({
        type: 'OTP_FAILED',
        message: e.message,
        locked: e.code === 'OTP_LOCKED' || e.code === 'OTP_MAX_ATTEMPTS',
        expired: e.code === 'OTP_EXPIRED',
      });
    }
  }

  async function handleAccept(challengeId: string) {
    dispatch({ type: 'CONFIRM_ACCEPT' });
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await signingApi.accept(token, challengeId, locale, timezone);
      dispatch({ type: 'ACCEPTED', acceptedAt: result.acceptedAt, certificateId: result.certificateId });
    } catch (err) {
      dispatch({ type: 'ACCEPT_FAILED', message: (err as ApiError).message });
    }
  }

  async function handleDecline() {
    // Capture challengeId before dispatching DECLINE (which transitions phase to 'accepting').
    // otp_entry: challengeId is in phase.otp; acceptance: challengeId is on the phase directly.
    // offer_view: no OTP has been issued yet — decline proceeds without a challengeId (server fallback).
    let challengeId: string | undefined;
    if (phase.name === 'otp_entry') challengeId = phase.otp.challengeId;
    else if (phase.name === 'acceptance') challengeId = phase.challengeId;

    dispatch({ type: 'DECLINE' }); // show spinner immediately
    try {
      await signingApi.decline(token, challengeId);
      dispatch({ type: 'DECLINED' });
    } catch (err) {
      // Server call failed — tell the recipient so they can retry.
      // NEVER dispatch DECLINED here: that would show a false success screen
      // while the offer remains SENT in the database.
      // ApiError in signing-api.ts is a plain object (interface), not a class —
      // check for the shape rather than using instanceof.
      const message =
        err != null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Could not process your decline. Please try again.';
      dispatch({ type: 'DECLINE_FAILED', message });
    }
  }

  // Session ID for trust banner (available once context is loaded)
  const sessionId = 'ctx' in phase ? (phase.ctx as OfferContext & { sessionId?: string }).sessionId : undefined;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[--color-bg] flex flex-col">
      <TrustBanner sessionId={sessionId} />

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-10">
        {phase.name === 'loading' && (
          <SpinnerPage label="Loading deal…" />
        )}

        {phase.name === 'invalid_link' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <XCircle className="w-12 h-12 text-red-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">Link not found</h1>
            <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
              This link is invalid or has already expired. Please contact the sender for a new link.
            </p>
          </div>
        )}

        {phase.name === 'offer_expired' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <XCircle className="w-12 h-12 text-amber-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">Deal expired</h1>
            <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
              This deal is no longer open for acceptance.
              {phase.expiresAt && (
                <> It expired on {new Date(phase.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</>
              )}
            </p>
          </div>
        )}

        {phase.name === 'already_terminal' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <CheckCircle className="w-12 h-12 text-blue-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">Deal closed</h1>
            <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
              This deal has already been responded to.
            </p>
          </div>
        )}

        {phase.name === 'offer_view' && (
          <>
            {phase.declineError && (
              <Alert variant="error" className="mb-4">
                {phase.declineError}
              </Alert>
            )}
            <OfferView ctx={phase.ctx} onContinue={handleContinue} onDecline={handleDecline} />
          </>
        )}

        {phase.name === 'otp_requesting' && (
          <SpinnerPage label="Sending verification code…" />
        )}

        {(phase.name === 'otp_entry' || phase.name === 'otp_error') && (
          <OtpEntry
            ctx={phase.ctx}
            otp={phase.otp}
            codeRef={codeRef}
            error={phase.name === 'otp_error' ? phase.message : undefined}
            locked={phase.name === 'otp_error' ? phase.locked : false}
            expired={phase.name === 'otp_error' ? phase.expired : false}
            onSubmit={() => handleVerifyCode(phase.otp)}
            onResend={handleContinue}
          />
        )}

        {phase.name === 'otp_verifying' && (
          <SpinnerPage label="Verifying code…" />
        )}

        {phase.name === 'acceptance' && (
          <AcceptanceView
            ctx={phase.ctx}
            challengeId={phase.challengeId}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}

        {phase.name === 'accepting' && (
          <SpinnerPage label="Processing…" />
        )}

        {phase.name === 'completed' && (
          <CompletedView acceptedAt={phase.acceptedAt} certificateId={phase.certificateId} />
        )}

        {phase.name === 'declined' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <XCircle className="w-12 h-12 text-gray-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">Deal declined</h1>
            <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
              You have declined this deal. No further action is needed.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-views ─────────────────────────────────────────────────────────────────

function OfferView({
  ctx,
  onContinue,
  onDecline,
}: {
  ctx: OfferContext;
  onContinue: () => void;
  onDecline: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-[--color-text-muted] mb-1">
        Deal from <span className="font-medium text-gray-700">{ctx.senderName}</span>
      </p>
      <h1 className="font-serif text-2xl text-[--color-text-primary]">{ctx.offerTitle}</h1>

      {ctx.offerMessage && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-[--color-text-secondary] leading-relaxed">{ctx.offerMessage}</p>
      )}

      {ctx.expiresAt && (
        <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
          ⏰ Expires {new Date(ctx.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {ctx.documents.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Documents included in this deal ({ctx.documents.length})
          </h2>
          <ul className="space-y-2">
            {ctx.documents.map((d) => (
              <li key={d.documentId}>
                <DocumentPreviewCard
                  filename={d.filename}
                  sizeBytes={d.sizeBytes}
                  mimeType={d.mimeType}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button variant="primary" size="md" onClick={onContinue} leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}>
          Continue to accept
        </Button>
        <Button variant="ghost" size="md" onClick={onDecline} className="text-gray-500">
          Decline
        </Button>
      </div>
    </div>
  );
}

function OtpEntry({
  otp,
  codeRef,
  error,
  locked,
  expired,
  onSubmit,
  onResend,
}: {
  ctx: OfferContext;
  otp: OtpResult;
  codeRef: React.RefObject<HTMLInputElement | null>;
  error?: string;
  locked: boolean;
  expired: boolean;
  onSubmit: () => void;
  onResend: () => void;
}) {
  // Input is blocked when the code is definitively unusable.
  const inputBlocked = locked || expired;

  // Expiry clock — shows the wall-clock time the code stops being valid.
  const expiresAtTime = new Date(otp.expiresAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card>
      <CardHeader title="Verify your email" border />
      <CardSection>
        <p className="text-sm text-[--color-text-secondary] mb-1">
          A 6-digit code was sent to <strong className="text-gray-900">{otp.deliveryAddressMasked}</strong>.
        </p>
        <p className="text-sm text-[--color-text-secondary] mb-4">
          This code confirms you control the email address this deal was sent to.
        </p>

        {/* Wrong-code error — only shown when neither locked nor expired */}
        {error && !inputBlocked && (
          <Alert variant="error" className="mb-4">{error}</Alert>
        )}

        {/* Locked: too many wrong attempts */}
        {locked && (
          <Alert variant="error" className="mb-4">
            Too many incorrect attempts. This code has been locked. Request a new code below.
          </Alert>
        )}

        {/* Expired: code TTL elapsed — give a clear inline recovery path */}
        {expired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
            <p className="text-sm font-semibold text-amber-800">Your verification code has expired.</p>
            <p className="text-sm text-amber-700 mt-1">
              Codes are valid for 10 minutes.{' '}
              <button
                onClick={onResend}
                className="font-semibold underline underline-offset-2 hover:text-amber-900"
              >
                Send a new code →
              </button>
            </p>
          </div>
        )}

        {/* Code entry — hidden when code is no longer usable */}
        {!inputBlocked && (
          <div className="flex items-end gap-3">
            <div>
              <label htmlFor="otp-code" className="block text-xs font-medium text-gray-700 mb-1">
                Verification code
                <span className="ml-2 font-normal text-gray-400">· expires {expiresAtTime}</span>
              </label>
              <input
                id="otp-code"
                ref={codeRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                className="block w-36 rounded-lg border border-[--color-border] px-3 py-2.5 text-center text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-[--color-accent] focus:border-transparent"
                placeholder="——————"
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              />
            </div>
            <Button variant="primary" size="md" onClick={onSubmit}>
              Verify
            </Button>
          </div>
        )}
      </CardSection>

      {/* Footer resend link — hidden when the expired block already shows an inline CTA */}
      {!expired && (
        <CardFooter>
          <button
            onClick={onResend}
            className="text-sm text-[--color-accent] hover:underline"
          >
            Didn&rsquo;t receive a code? Send a new one
          </button>
        </CardFooter>
      )}
    </Card>
  );
}

function AcceptanceView({
  ctx,
  challengeId,
  onAccept,
  onDecline,
}: {
  ctx: OfferContext;
  challengeId: string;
  onAccept: (challengeId: string) => void;
  onDecline: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-[--color-text-primary] mb-2">Accept this deal</h2>
      <p className="text-sm text-[--color-text-secondary] mb-4">
        By clicking <strong>I Accept</strong>, you agree to the following:
      </p>

      <div className="border-l-4 border-blue-500 bg-blue-50 px-5 py-4 rounded-r-xl mb-6">
        <p className="text-sm text-gray-800 italic leading-relaxed">{ctx.acceptanceStatement}</p>
      </div>

      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={() => onAccept(challengeId)}
          leftIcon={<CheckCircle className="w-4 h-4" aria-hidden="true" />}
          className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
        >
          I Accept
        </Button>
        <Button variant="ghost" size="md" onClick={onDecline} className="text-gray-500">
          Decline
        </Button>
      </div>
    </div>
  );
}

function CompletedView({ acceptedAt, certificateId }: { acceptedAt: string; certificateId: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4 animate-fade-in">

      {/* ── Animated checkmark icon ─────────────────────────────────────────── */}
      <div
        className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mb-7
                   ring-4 ring-green-200 animate-pulse-ring shadow-xl shadow-green-200/60"
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48" fill="none" className="w-14 h-14">
          <path
            d="M12 25l9 9 15-16"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-check-draw"
          />
        </svg>
      </div>

      {/* ── Heading ─────────────────────────────────────────────────────────── */}
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Accepted. Your record is secured.</h1>
      <p className="text-base text-gray-700 font-medium max-w-sm mb-2">
        Your acceptance has been recorded.
      </p>
      <p className="text-sm text-[--color-text-secondary] max-w-sm mb-6">
        Accepted on{' '}
        <time
          dateTime={acceptedAt}
          className="font-medium text-gray-900"
        >
          {new Date(acceptedAt).toLocaleString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </time>
        .
      </p>

      {/* ── Certificate notice ──────────────────────────────────────────────── */}
      <div className="max-w-sm w-full rounded-xl border border-green-200 bg-green-50 px-5 py-4 mb-6">
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5"
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M10 1a9 9 0 100 18A9 9 0 0010 1zM8.293 13.707a1 1 0 001.414 0l4-4a1 1 0 00-1.414-1.414L9 11.586 7.707 10.293a1 1 0 00-1.414 1.414l2 2z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-green-800 mb-2">
              Acceptance certificate issued
            </p>
            <p className="text-xs text-green-700 leading-relaxed mb-2">
              A certificate has been generated containing:
            </p>
            <ul className="text-xs text-green-700 space-y-1 mb-2">
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 flex-shrink-0" aria-hidden="true">·</span>
                the accepted deal and attached documents
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 flex-shrink-0" aria-hidden="true">·</span>
                the acceptance timestamp
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-0.5 flex-shrink-0" aria-hidden="true">·</span>
                a cryptographic integrity hash
              </li>
            </ul>
            <p className="text-xs text-green-700 leading-relaxed">
              Anyone can verify this record using the Certificate ID.
            </p>
          </div>
        </div>
      </div>

      {/* ── Certificate access ───────────────────────────────────────────────
           Shown when the certificate was issued before this response.
           When certificateId is null (still generating), the notice above
           tells users it will be emailed to both parties — no dead-end. */}
      {certificateId && (
        <a
          href={`/verify/${certificateId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mb-6 px-5 py-2.5 rounded-xl border border-green-300 bg-white text-sm font-medium text-green-700 hover:bg-green-50 transition-colors shadow-sm"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
          View acceptance certificate
        </a>
      )}

      {/* ── Trust footer ────────────────────────────────────────────────────── */}
      <p className="text-xs text-[--color-text-muted]">
        🔒 Verified with OTP · SHA-256 sealed · Audit trail preserved
      </p>
    </div>
  );
}
