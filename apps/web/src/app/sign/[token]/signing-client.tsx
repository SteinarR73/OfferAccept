'use client';

import { useEffect, useReducer, useRef } from 'react';
import { CheckCircle, XCircle, Shield } from 'lucide-react';
import { signingApi, OfferContext, OtpResult, ApiError } from '@/lib/signing-api';
import { SpinnerPage } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
  | { name: 'offer_view'; ctx: OfferContext }
  | { name: 'otp_requesting'; ctx: OfferContext }
  | { name: 'otp_entry'; ctx: OfferContext; otp: OtpResult; error?: string }
  | { name: 'otp_verifying'; ctx: OfferContext; otp: OtpResult }
  | { name: 'otp_error'; ctx: OfferContext; otp: OtpResult; message: string; locked: boolean }
  | { name: 'acceptance'; ctx: OfferContext; challengeId: string }
  | { name: 'accepting'; ctx: OfferContext }
  | { name: 'completed'; acceptedAt: string }
  | { name: 'declined' };

type Action =
  | { type: 'CONTEXT_LOADED'; ctx: OfferContext }
  | { type: 'LOAD_FAILED'; code: string; expiresAt?: string }
  | { type: 'CONTINUE_TO_OTP' }
  | { type: 'OTP_SENT'; otp: OtpResult }
  | { type: 'OTP_SEND_FAILED'; message: string }
  | { type: 'SUBMIT_CODE'; code: string }
  | { type: 'OTP_VERIFIED'; challengeId: string }
  | { type: 'OTP_FAILED'; message: string; locked: boolean }
  | { type: 'CONFIRM_ACCEPT' }
  | { type: 'ACCEPTED'; acceptedAt: string }
  | { type: 'ACCEPT_FAILED'; message: string }
  | { type: 'DECLINE' }
  | { type: 'DECLINED' };

function reducer(state: Phase, action: Action): Phase {
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
      if (state.name !== 'offer_view') return state;
      return { name: 'otp_requesting', ctx: state.ctx };

    case 'OTP_SENT':
      if (state.name !== 'otp_requesting' && state.name !== 'otp_entry') return state;
      return { name: 'otp_entry', ctx: state.ctx, otp: action.otp };

    case 'OTP_SEND_FAILED':
      if (state.name !== 'otp_requesting') return state;
      return { name: 'offer_view', ctx: state.ctx };

    case 'SUBMIT_CODE':
      if (state.name !== 'otp_entry') return state;
      return { name: 'otp_verifying', ctx: state.ctx, otp: state.otp };

    case 'OTP_VERIFIED':
      if (state.name !== 'otp_verifying') return state;
      return { name: 'acceptance', ctx: state.ctx, challengeId: action.challengeId };

    case 'OTP_FAILED':
      if (state.name !== 'otp_verifying') return state;
      return { name: 'otp_error', ctx: state.ctx, otp: state.otp, message: action.message, locked: action.locked };

    case 'CONFIRM_ACCEPT':
      if (state.name !== 'acceptance') return state;
      return { name: 'accepting', ctx: state.ctx };

    case 'ACCEPTED':
      return { name: 'completed', acceptedAt: action.acceptedAt };

    case 'ACCEPT_FAILED':
      if (state.name !== 'accepting') return state;
      return { name: 'offer_view', ctx: state.ctx };

    case 'DECLINE':
      if (state.name !== 'offer_view' && state.name !== 'otp_entry' && state.name !== 'acceptance')
        return state;
      return { name: 'accepting', ctx: (state as { ctx: OfferContext }).ctx };

    case 'DECLINED':
      return { name: 'declined' };

    default:
      return state;
  }
}

// ─── Trust banner ──────────────────────────────────────────────────────────────

function TrustBanner({ sessionId }: { sessionId?: string }) {
  return (
    <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center justify-center gap-4 text-xs text-green-800">
      <span className="flex items-center gap-1">
        🔒 Secure signing session
      </span>
      {sessionId && (
        <span className="font-mono opacity-70 hidden sm:inline">ID: {sessionId.slice(0, 12)}…</span>
      )}
      <span className="text-green-600">· End-to-end encrypted</span>
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
      });
    }
  }

  async function handleAccept(challengeId: string) {
    dispatch({ type: 'CONFIRM_ACCEPT' });
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await signingApi.accept(token, challengeId, locale, timezone);
      dispatch({ type: 'ACCEPTED', acceptedAt: result.acceptedAt });
    } catch (err) {
      dispatch({ type: 'ACCEPT_FAILED', message: (err as ApiError).message });
    }
  }

  async function handleDecline() {
    try {
      await signingApi.decline(token);
      dispatch({ type: 'DECLINED' });
    } catch {
      dispatch({ type: 'DECLINED' });
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
          <SpinnerPage label="Loading offer…" />
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
            <h1 className="text-xl font-semibold text-gray-900">Offer expired</h1>
            <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
              This offer is no longer open for acceptance.
              {phase.expiresAt && (
                <> It expired on {new Date(phase.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</>
              )}
            </p>
          </div>
        )}

        {phase.name === 'already_terminal' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <CheckCircle className="w-12 h-12 text-blue-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">Offer closed</h1>
            <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
              This offer has already been responded to.
            </p>
          </div>
        )}

        {phase.name === 'offer_view' && (
          <OfferView ctx={phase.ctx} onContinue={handleContinue} onDecline={handleDecline} />
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
          <SpinnerPage label="Submitting acceptance…" />
        )}

        {phase.name === 'completed' && (
          <CompletedView acceptedAt={phase.acceptedAt} />
        )}

        {phase.name === 'declined' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <XCircle className="w-12 h-12 text-gray-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">Offer declined</h1>
            <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
              You have declined this offer. No further action is needed.
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
        Offer from <span className="font-medium text-gray-700">{ctx.senderName}</span>
      </p>
      <h1 className="text-2xl font-semibold text-[--color-text-primary]">{ctx.offerTitle}</h1>

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
            Documents you are signing ({ctx.documents.length})
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
  onSubmit,
  onResend,
}: {
  ctx: OfferContext;
  otp: OtpResult;
  codeRef: React.RefObject<HTMLInputElement | null>;
  error?: string;
  locked: boolean;
  onSubmit: () => void;
  onResend: () => void;
}) {
  return (
    <Card>
      <CardHeader title="Verify your email" border />
      <CardSection>
        <p className="text-sm text-[--color-text-secondary] mb-4">
          A 6-digit code was sent to <strong className="text-gray-900">{otp.deliveryAddressMasked}</strong>.
          Enter it below to confirm your identity.
        </p>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {!locked && (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div>
                <label htmlFor="otp-code" className="block text-xs font-medium text-gray-700 mb-1">
                  Verification code
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
          </div>
        )}

        {locked && (
          <Alert variant="error">
            Too many incorrect attempts. This code has been locked. Request a new code below.
          </Alert>
        )}
      </CardSection>
      <CardFooter>
        <button
          onClick={onResend}
          className="text-xs text-[--color-accent] hover:underline"
        >
          Send a new code
        </button>
      </CardFooter>
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
      <h2 className="text-xl font-semibold text-[--color-text-primary] mb-2">Confirm acceptance</h2>
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

function CompletedView({ acceptedAt }: { acceptedAt: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      {/* Large green checkmark */}
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
        <svg viewBox="0 0 40 40" fill="none" className="w-12 h-12" aria-hidden="true">
          <circle cx="20" cy="20" r="20" fill="#dcfce7" />
          <path d="M11 21l6 6 12-13" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 className="text-2xl font-semibold text-gray-900">You're all set!</h1>
      <p className="mt-2 text-sm text-[--color-text-secondary] max-w-sm">
        Your acceptance was confirmed on{' '}
        {new Date(acceptedAt).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}.
      </p>
      <p className="mt-3 text-sm text-[--color-text-muted] max-w-sm">
        A confirmation email has been sent to you. An acceptance certificate will be issued
        and sent to both parties.
      </p>
    </div>
  );
}
