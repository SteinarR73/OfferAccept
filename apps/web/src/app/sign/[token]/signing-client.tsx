'use client';

import { useEffect, useReducer, useRef } from 'react';
import { signingApi, OfferContext, OtpResult, ApiError } from '@/lib/signing-api';

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
  | { type: 'CONTINUE_TO_OTP' }                       // user clicks "Continue"
  | { type: 'OTP_SENT'; otp: OtpResult }
  | { type: 'OTP_SEND_FAILED'; message: string }
  | { type: 'SUBMIT_CODE'; code: string }
  | { type: 'OTP_VERIFIED'; challengeId: string }
  | { type: 'OTP_FAILED'; message: string; locked: boolean }
  | { type: 'CONFIRM_ACCEPT' }                         // user clicks "I Accept"
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
      return { name: 'offer_view', ctx: state.ctx }; // fall back to offer view

    case 'SUBMIT_CODE':
      if (state.name !== 'otp_entry') return state;
      return { name: 'otp_verifying', ctx: state.ctx, otp: state.otp };

    case 'OTP_VERIFIED':
      if (state.name !== 'otp_verifying') return state;
      return { name: 'acceptance', ctx: state.ctx, challengeId: action.challengeId };

    case 'OTP_FAILED':
      if (state.name !== 'otp_verifying') return state;
      return {
        name: 'otp_error',
        ctx: state.ctx,
        otp: state.otp,
        message: action.message,
        locked: action.locked,
      };

    case 'CONFIRM_ACCEPT':
      if (state.name !== 'acceptance') return state;
      return { name: 'accepting', ctx: state.ctx };

    case 'ACCEPTED':
      return { name: 'completed', acceptedAt: action.acceptedAt };

    case 'ACCEPT_FAILED':
      // Restore acceptance state so user can try again (e.g., transient error)
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

// ─── Component ─────────────────────────────────────────────────────────────────

export function SigningClient({ token }: { token: string }) {
  const [phase, dispatch] = useReducer(reducer, { name: 'loading' });
  const codeRef = useRef<HTMLInputElement>(null);

  // Step 1: Load offer context on mount. No side effects.
  useEffect(() => {
    signingApi.getContext(token).then(
      (ctx) => dispatch({ type: 'CONTEXT_LOADED', ctx }),
      (err: ApiError) =>
        dispatch({ type: 'LOAD_FAILED', code: err.code, expiresAt: undefined }),
    );
  }, [token]);

  // Step 2: Issue OTP when user explicitly requests it.
  async function handleContinue() {
    dispatch({ type: 'CONTINUE_TO_OTP' });
    try {
      const otp = await signingApi.requestOtp(token);
      dispatch({ type: 'OTP_SENT', otp });
    } catch (err) {
      dispatch({ type: 'OTP_SEND_FAILED', message: (err as ApiError).message });
    }
  }

  // Step 3: Verify the submitted code.
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

  // Step 4a: Confirm acceptance.
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

  // Step 4b: Decline.
  async function handleDecline() {
    try {
      await signingApi.decline(token);
      dispatch({ type: 'DECLINED' });
    } catch {
      dispatch({ type: 'DECLINED' }); // still show declined regardless of error
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {phase.name === 'loading' && (
        <div className="text-gray-500">Loading offer…</div>
      )}

      {phase.name === 'invalid_link' && (
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Link not found</h1>
          <p className="mt-2 text-gray-600">
            This link is invalid or has expired. Please contact the sender for a new link.
          </p>
        </div>
      )}

      {phase.name === 'offer_expired' && (
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Offer expired</h1>
          <p className="mt-2 text-gray-600">This offer is no longer open for acceptance.</p>
        </div>
      )}

      {phase.name === 'already_terminal' && (
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Offer closed</h1>
          <p className="mt-2 text-gray-600">This offer has already been responded to.</p>
        </div>
      )}

      {(phase.name === 'offer_view') && (
        <OfferView ctx={phase.ctx} onContinue={handleContinue} onDecline={handleDecline} />
      )}

      {phase.name === 'otp_requesting' && (
        <div className="text-gray-500">Sending verification code…</div>
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
        <div className="text-gray-500">Verifying code…</div>
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
        <div className="text-gray-500">Submitting…</div>
      )}

      {phase.name === 'completed' && (
        <CompletedView acceptedAt={phase.acceptedAt} />
      )}

      {phase.name === 'declined' && (
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Offer declined</h1>
          <p className="mt-2 text-gray-600">You have declined this offer. No further action is needed.</p>
        </div>
      )}
    </main>
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
      <p className="text-sm text-gray-500">
        Offer from <strong>{ctx.senderName}</strong>
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-gray-900">{ctx.offerTitle}</h1>
      {ctx.offerMessage && (
        <p className="mt-4 whitespace-pre-wrap text-gray-700">{ctx.offerMessage}</p>
      )}
      {ctx.expiresAt && (
        <p className="mt-4 text-sm text-gray-500">
          Expires: {new Date(ctx.expiresAt).toLocaleDateString()}
        </p>
      )}
      {ctx.documents.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-700">Documents</h2>
          <ul className="mt-2 space-y-1">
            {ctx.documents.map((d) => (
              <li key={d.documentId} className="text-sm text-gray-600">
                {d.filename} ({(d.sizeBytes / 1024).toFixed(0)} KB)
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-8 flex gap-4">
        <button
          onClick={onContinue}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Continue to accept
        </button>
        <button
          onClick={onDecline}
          className="rounded border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function OtpEntry({
  ctx,
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
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Verify your email</h2>
      <p className="mt-2 text-gray-600">
        A 6-digit code was sent to <strong>{otp.deliveryAddressMasked}</strong>. Enter it below to
        confirm your identity before accepting the offer.
      </p>
      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
      {!locked && (
        <div className="mt-4 flex items-end gap-3">
          <div>
            <label htmlFor="otp-code" className="block text-sm font-medium text-gray-700">
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
              className="mt-1 block w-36 rounded border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="000000"
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            />
          </div>
          <button
            onClick={onSubmit}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Verify
          </button>
        </div>
      )}
      <button
        onClick={onResend}
        className="mt-4 text-sm text-blue-600 underline hover:text-blue-800"
      >
        Send a new code
      </button>
    </div>
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
      <h2 className="text-xl font-semibold text-gray-900">Confirm acceptance</h2>
      <p className="mt-2 text-gray-600">
        By clicking <strong>I Accept</strong>, you agree to the following:
      </p>
      <blockquote className="mt-4 rounded border-l-4 border-blue-200 bg-blue-50 px-4 py-3 text-sm text-gray-700 italic">
        {ctx.acceptanceStatement}
      </blockquote>
      <div className="mt-6 flex gap-4">
        <button
          onClick={() => onAccept(challengeId)}
          className="rounded bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          I Accept
        </button>
        <button
          onClick={onDecline}
          className="rounded border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function CompletedView({ acceptedAt }: { acceptedAt: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Offer accepted</h1>
      <p className="mt-2 text-gray-600">
        Your acceptance was confirmed on{' '}
        {new Date(acceptedAt).toLocaleString()}. A confirmation email has been sent to you.
      </p>
      <p className="mt-4 text-sm text-gray-500">
        An acceptance certificate will be issued and sent to both parties.
      </p>
    </div>
  );
}
