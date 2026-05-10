'use client';

import { useEffect, useReducer, useRef } from 'react';
import { CheckCircle, XCircle, Shield } from 'lucide-react';
import { signingApi, OfferContext, OtpResult, ApiError } from '@/lib/signing-api';
import { track } from '@/lib/analytics';
import { SpinnerPage } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardSection, CardFooter } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { DocumentPreviewCard } from '@/components/sign/DocumentPreviewCard';
import { OfferAcceptIcon } from '@/components/brand/OfferAcceptIcon';

// ─── Locale strings ───────────────────────────────────────────────────────────

const EN = {
  trustBanner: {
    sentBy: (name: string) => `Sent by ${name}`,
    secureSession: 'Secure acceptance session',
    verifiedBy: 'Verified by',
  },
  loading: {
    document: 'Loading document…',
    sendingCode: 'Sending verification code…',
    verifyingCode: 'Verifying code…',
    recording: 'Recording your acceptance…',
  },
  invalidLink: {
    heading: 'Link not found',
    body: 'This link is invalid or has already expired. Please contact the sender for a new link.',
  },
  expired: {
    heading: 'Document expired',
    body: 'This document is no longer open for acceptance.',
    expiredOn: (date: string) => `It expired on ${date}.`,
  },
  alreadyTerminal: {
    acceptedHeading: 'Document accepted',
    acceptedBody: (date: string) => `This document was accepted on ${date}.`,
    acceptedBodyFallback: 'This document has already been accepted.',
    viewCert: 'View acceptance certificate →',
    closedHeading: 'Document closed',
    closedBody: 'This document has already been responded to.',
  },
  offerView: {
    sentBy: 'Sent by',
    identitySentence: (name: string) =>
      `${name} used OfferAccept to share this document with you securely. You'll confirm receipt with your email address.`,
    documentsIncluded: (n: number) => `Documents included (${n})`,
    expiresOn: (date: string) => `Expires ${date}`,
    platformBox: (senderName: string) =>
      `This document was shared using OfferAccept, which records a verified acceptance certificate when you confirm. No account required.`,
    continueBtn: 'Continue to accept',
    declineBtn: 'Decline',
  },
  otp: {
    heading: 'Verify your email',
    whyTitle: 'Why do we ask for a code?',
    whyBody: 'The code proves you control this email address — the one the sender used. It links your acceptance to a verified identity without requiring an account.',
    gdprTitle: 'How your information is used',
    gdprSentBy: (name: string) => `${name} shared this document using OfferAccept.`,
    gdprIfConfirm: 'If you confirm acceptance we record:',
    gdprItems: ['email address', 'time of confirmation', 'device information'],
    gdprBasis: 'This creates a verifiable acceptance record. Processing is based on legitimate interests.',
    gdprLink: 'Privacy notice →',
    sentTo: (masked: string) => `A 6-digit code was sent to`,
    verifyingAddress: (name: string) =>
      `We are verifying that you control this address — the one ${name} used to send this document.`,
    codeLabel: 'Verification code',
    codeExpires: (time: string) => `· expires ${time}`,
    verifyBtn: 'Verify',
    lockedMsg: 'Too many incorrect attempts. This code has been locked. Request a new code below.',
    expiredHeading: 'Your verification code has expired.',
    expiredBody: 'Codes are valid for 10 minutes.',
    expiredResend: 'Send a new code →',
    resendLink: "Didn’t receive a code? Send a new one",
  },
  acceptance: {
    heading: 'Accept this document',
    subheading: 'You are accepting the following:',
    disclosureTitle: 'By clicking Accept you confirm that:',
    disclosureItems: [
      'you are the intended recipient of this document',
      'you have read and understood the document displayed here',
      'you accept the document in the form presented',
    ],
    disclosureFooter:
      'Your confirmation will be recorded together with your email address, time of acceptance, and device information.',
    eidasNote:
      'This confirmation records acceptance evidence. It is not a qualified electronic signature under EU Regulation No 910/2014 (eIDAS).',
    clarityLine1: 'This is a confirmation of acceptance — not a formal electronic signature.',
    clarityLine2: 'Your confirmation will be recorded as evidence of acceptance.',
    clarityLine3: 'Only proceed if you are the intended recipient of this document.',
    acceptBtn: 'I Accept',
    declineBtn: 'Decline',
  },
  completed: {
    heading: 'Accepted. Your record is secured.',
    subheading: 'Your acceptance has been recorded.',
    acceptedOn: 'Accepted on',
    certTitle: 'Acceptance certificate issued',
    certBody: 'A certificate has been generated containing:',
    certItems: [
      'the accepted document and attached files',
      'the acceptance timestamp',
      'a cryptographic integrity hash',
    ],
    certVerify: 'Anyone can verify this record using the Certificate ID.',
    certSentTo: (name: string) => `A copy of this acceptance certificate has also been sent to ${name}.`,
    certSentToFallback: 'A copy of this acceptance certificate has also been sent to the sender.',
    viewCert: 'View acceptance certificate',
    trustFooter: '🔒 Verified with OTP · SHA-256 sealed · Audit trail preserved',
  },
  otpVerified: {
    heading: 'Identity verified',
    body: 'Taking you to the acceptance statement…',
  },
  declined: {
    heading: 'Document declined',
    body: (senderName: string) => `You have declined this document. ${senderName} will be notified.`,
  },
} as const;

const NO = {
  trustBanner: {
    sentBy: (name: string) => `Sendt av ${name}`,
    secureSession: 'Sikker godkjenningsøkt',
    verifiedBy: 'Bekreftet av',
  },
  loading: {
    document: 'Laster dokument…',
    sendingCode: 'Sender verifiseringskode…',
    verifyingCode: 'Bekrefter kode…',
    recording: 'Registrerer bekreftelse…',
  },
  invalidLink: {
    heading: 'Lenken er ugyldig',
    body: 'Denne lenken finnes ikke eller har utløpt. Kontakt avsenderen for å få en ny lenke.',
  },
  expired: {
    heading: 'Dokumentet har utløpt',
    body: 'Dette dokumentet er ikke lenger åpent for godkjenning.',
    expiredOn: (date: string) => `Det utløpte ${date}.`,
  },
  alreadyTerminal: {
    acceptedHeading: 'Dokumentet er bekreftet',
    acceptedBody: (date: string) => `Dette dokumentet ble bekreftet ${date}.`,
    acceptedBodyFallback: 'Dette dokumentet er allerede bekreftet.',
    viewCert: 'Se akseptbevis →',
    closedHeading: 'Dokumentet er lukket',
    closedBody: 'Dette dokumentet er allerede besvart.',
  },
  offerView: {
    sentBy: 'Sendt av',
    identitySentence: (name: string) =>
      `${name} brukte OfferAccept for å dele dette dokumentet med deg på en sikker måte. Du bekrefter mottak med e-postadressen din.`,
    documentsIncluded: (n: number) => `Vedlagte dokumenter (${n})`,
    expiresOn: (date: string) => `Utløper ${date}`,
    platformBox: (senderName: string) =>
      `Dette dokumentet ble delt via OfferAccept, som registrerer et bekreftet akseptbevis når du godkjenner. Ingen konto nødvendig.`,
    continueBtn: 'Fortsett til godkjenning',
    declineBtn: 'Avslå',
  },
  otp: {
    heading: 'Bekreft e-postadressen din',
    whyTitle: 'Hvorfor ber vi om en kode?',
    whyBody: 'Koden beviser at du kontrollerer denne e-postadressen — den avsenderen brukte. Den knytter bekreftelsen din til en verifisert identitet uten at du trenger en konto.',
    gdprTitle: 'Slik brukes informasjonen din',
    gdprSentBy: (name: string) => `${name} delte dette dokumentet via OfferAccept.`,
    gdprIfConfirm: 'Hvis du bekrefter aksept, registrerer vi:',
    gdprItems: ['e-postadresse', 'tidspunkt for bekreftelse', 'enhetsinformasjon'],
    gdprBasis:
      'Dette oppretter et etterprøvbart akseptbevis. Grunnlaget for behandlingen er berettiget interesse.',
    gdprLink: 'Personvernerklæring →',
    sentTo: (masked: string) => `En 6-sifret kode ble sendt til`,
    verifyingAddress: (name: string) =>
      `Vi bekrefter at du kontrollerer denne adressen — den ${name} brukte for å sende dette dokumentet.`,
    codeLabel: 'Verifiseringskode',
    codeExpires: (time: string) => `· utløper ${time}`,
    verifyBtn: 'Bekreft',
    lockedMsg:
      'For mange feil forsøk. Denne koden er låst. Be om en ny kode nedenfor.',
    expiredHeading: 'Verifiseringskoden har utløpt.',
    expiredBody: 'Koder er gyldige i 10 minutter.',
    expiredResend: 'Send ny kode →',
    resendLink: 'Mottok du ikke koden? Send en ny',
  },
  acceptance: {
    heading: 'Bekreft dette dokumentet',
    subheading: 'Du bekrefter følgende:',
    disclosureTitle: 'Ved å klikke Godkjenn bekrefter du at:',
    disclosureItems: [
      'du er den tiltenkte mottakeren av dette dokumentet',
      'du har lest og forstått dokumentet som vises her',
      'du godkjenner dokumentet i den form det er presentert',
    ],
    disclosureFooter:
      'Din bekreftelse vil bli registrert sammen med din e-postadresse, tidspunkt for aksept og enhetsinformasjon.',
    eidasNote:
      'Denne bekreftelsen registrerer akseptbevis. Det er ikke en kvalifisert elektronisk signatur i henhold til EU-forordning nr. 910/2014 (eIDAS).',
    clarityLine1: 'Dette er en akseptbekreftelse — ikke en formell elektronisk signatur.',
    clarityLine2: 'Din bekreftelse vil bli registrert som bevis på aksept.',
    clarityLine3:
      'Gå kun videre hvis du er den tiltenkte mottakeren av dette dokumentet.',
    acceptBtn: 'Godkjenn',
    declineBtn: 'Avslå',
  },
  completed: {
    heading: 'Bekreftet. Beviset er sikret.',
    subheading: 'Din bekreftelse er registrert.',
    acceptedOn: 'Bekreftet',
    certTitle: 'Akseptbevis utstedt',
    certBody: 'Et sertifikat er generert med:',
    certItems: [
      'det godkjente dokumentet og vedlegg',
      'tidspunkt for aksept',
      'et kryptografisk integritetshash',
    ],
    certVerify: 'Alle kan verifisere denne posten ved hjelp av sertifikat-ID.',
    certSentTo: (name: string) => `En kopi av akseptbeviset er sendt til ${name}.`,
    certSentToFallback: 'En kopi av akseptbeviset er sendt til avsenderen.',
    viewCert: 'Se akseptbevis',
    trustFooter: '🔒 Bekreftet med OTP · SHA-256-forseglet · Revisjonslogg bevart',
  },
  otpVerified: {
    heading: 'Identitet bekreftet',
    body: 'Tar deg til bekreftelsesteksten…',
  },
  declined: {
    heading: 'Dokument avslått',
    body: (senderName: string) => `Du har avslått dette dokumentet. ${senderName} vil bli varslet.`,
  },
} as const;

type Strings = typeof EN | typeof NO;
type Locale = 'en' | 'no';

function useStrings(locale: Locale): Strings {
  return locale === 'no' ? NO : EN;
}

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
  | { name: 'already_terminal'; reason: string; acceptedAt?: string; certificateId?: string }
  | { name: 'offer_view'; ctx: OfferContext; declineError?: string }
  // prevOtp is set when this is a resend request from the OTP screen.
  // It lets OTP_SEND_FAILED return to otp_entry (with the still-valid old OTP)
  // rather than dropping the user back to offer_view.
  | { name: 'otp_requesting'; ctx: OfferContext; prevOtp?: OtpResult }
  | { name: 'otp_entry'; ctx: OfferContext; otp: OtpResult; error?: string }
  | { name: 'otp_verifying'; ctx: OfferContext; otp: OtpResult }
  | { name: 'otp_error'; ctx: OfferContext; otp: OtpResult; message: string; locked: boolean; expired: boolean }
  | { name: 'otp_verified'; ctx: OfferContext; challengeId: string }
  | { name: 'acceptance'; ctx: OfferContext; challengeId: string }
  | { name: 'accepting'; ctx: OfferContext }
  | { name: 'completed'; acceptedAt: string; certificateId: string | null; senderName: string }
  | { name: 'declined'; senderName: string };

type Action =
  | { type: 'CONTEXT_LOADED'; ctx: OfferContext }
  | { type: 'LOAD_FAILED'; code: string; expiresAt?: string; detail?: Record<string, unknown> }
  | { type: 'CONTINUE_TO_OTP' }
  | { type: 'OTP_SENT'; otp: OtpResult }
  | { type: 'OTP_SEND_FAILED'; message: string }
  | { type: 'SUBMIT_CODE'; code: string }
  | { type: 'OTP_VERIFIED'; challengeId: string }
  | { type: 'OTP_FAILED'; message: string; locked: boolean; expired: boolean }
  | { type: 'CONFIRM_ACCEPT' }
  | { type: 'ACCEPTED'; acceptedAt: string; certificateId: string | null; senderName: string }
  | { type: 'ACCEPT_FAILED'; message: string }
  | { type: 'ADVANCE_TO_STATEMENT' }
  | { type: 'DECLINE' }
  | { type: 'DECLINED'; senderName: string }
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
        return {
          name: 'already_terminal',
          reason: action.code,
          acceptedAt: action.detail?.['acceptedAt'] as string | undefined,
          certificateId: action.detail?.['certificateId'] as string | undefined,
        };
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
      return { name: 'otp_verified', ctx: state.ctx, challengeId: action.challengeId };

    case 'ADVANCE_TO_STATEMENT':
      if (state.name !== 'otp_verified') return state;
      return { name: 'acceptance', ctx: state.ctx, challengeId: state.challengeId };

    case 'OTP_FAILED':
      if (state.name !== 'otp_verifying') return state;
      return { name: 'otp_error', ctx: state.ctx, otp: state.otp, message: action.message, locked: action.locked, expired: action.expired };

    case 'CONFIRM_ACCEPT':
      if (state.name !== 'acceptance') return state;
      return { name: 'accepting', ctx: state.ctx };

    case 'ACCEPTED':
      return { name: 'completed', acceptedAt: action.acceptedAt, certificateId: action.certificateId, senderName: action.senderName };

    case 'ACCEPT_FAILED':
      if (state.name !== 'accepting') return state;
      return { name: 'offer_view', ctx: state.ctx };

    case 'DECLINE':
      if (state.name !== 'offer_view' && state.name !== 'otp_entry' && state.name !== 'acceptance')
        return state;
      return { name: 'accepting', ctx: (state as { ctx: OfferContext }).ctx };

    case 'DECLINED':
      return { name: 'declined', senderName: action.senderName };

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

function TrustBanner({ senderName, s }: { senderName?: string; s: Strings }) {
  return (
    <div className="bg-green-50 border-b border-green-200 px-4 py-2.5">
      <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center sm:justify-between gap-1 sm:gap-4">
        {/* Sender — visually dominant */}
        <p className="text-sm font-semibold text-green-900">
          {senderName ? s.trustBanner.sentBy(senderName) : s.trustBanner.secureSession}
        </p>
        {/* Platform — secondary verification layer */}
        <span className="flex items-center gap-1.5 text-[11px] text-green-600 flex-shrink-0">
          <span aria-hidden="true">🔒</span>
          {s.trustBanner.verifiedBy}
          <OfferAcceptIcon size="sm" className="w-3.5 h-3.5" />
          <span className="font-medium">OfferAccept</span>
        </span>
      </div>
    </div>
  );
}

// ─── SigningClient ─────────────────────────────────────────────────────────────

export function SigningClient({ token, locale = 'en' }: { token: string; locale?: Locale }) {
  const [phase, dispatch] = useReducer(reducer, { name: 'loading' });
  const codeRef = useRef<HTMLInputElement | null>(null);
  const s = useStrings(locale);

  useEffect(() => {
    signingApi.getContext(token).then(
      (ctx) => {
        dispatch({ type: 'CONTEXT_LOADED', ctx });
        track('recipient.link_opened', { locale });
      },
      (err: ApiError) => {
        dispatch({ type: 'LOAD_FAILED', code: err.code, expiresAt: undefined, detail: err.detail });
        if (err.code === 'OFFER_EXPIRED') track('recipient.link_expired', { locale });
        else if (err.code === 'OFFER_ALREADY_ACCEPTED') track('recipient.already_accepted', { locale });
        else track('recipient.invalid_link', { locale });
      },
    );
  }, [token, locale]);

  async function handleContinue() {
    dispatch({ type: 'CONTINUE_TO_OTP' });
    track('recipient.otp_requested', { locale });
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
      track('recipient.otp_verified', { locale });
    } catch (err) {
      const e = err as ApiError;
      const locked = e.code === 'OTP_LOCKED' || e.code === 'OTP_MAX_ATTEMPTS';
      const expired = e.code === 'OTP_EXPIRED';
      dispatch({ type: 'OTP_FAILED', message: e.message, locked, expired });
      track(locked ? 'recipient.otp_locked' : 'recipient.otp_failed', { locale });
    }
  }

  async function handleAccept(challengeId: string) {
    dispatch({ type: 'CONFIRM_ACCEPT' });
    try {
      const browserLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = await signingApi.accept(token, challengeId, browserLocale, timezone);
      const senderName = phase.name === 'accepting' && 'ctx' in phase ? (phase as { ctx: { senderName: string } }).ctx.senderName : '';
      dispatch({ type: 'ACCEPTED', acceptedAt: result.acceptedAt, certificateId: result.certificateId, senderName });
      track('recipient.accepted', { locale });
    } catch (err) {
      dispatch({ type: 'ACCEPT_FAILED', message: (err as ApiError).message });
    }
  }

  async function handleDecline() {
    // Capture challengeId and senderName before dispatching DECLINE (which transitions phase to 'accepting').
    // otp_entry: challengeId is in phase.otp; acceptance: challengeId is on the phase directly.
    // offer_view: no OTP has been issued yet — decline proceeds without a challengeId (server fallback).
    let challengeId: string | undefined;
    if (phase.name === 'otp_entry') challengeId = phase.otp.challengeId;
    else if (phase.name === 'acceptance') challengeId = phase.challengeId;
    const decliningFromCtx = 'ctx' in phase ? (phase as { ctx: OfferContext }).ctx : null;
    const senderNameForDecline = decliningFromCtx?.senderName ?? '';

    dispatch({ type: 'DECLINE' }); // show spinner immediately
    try {
      await signingApi.decline(token, challengeId);
      dispatch({ type: 'DECLINED', senderName: senderNameForDecline });
      track('recipient.declined', { locale });
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

  // Auto-advance from otp_verified transient state after a brief moment
  useEffect(() => {
    if (phase.name !== 'otp_verified') return;
    const t = setTimeout(() => dispatch({ type: 'ADVANCE_TO_STATEMENT' }), 700);
    return () => clearTimeout(t);
  }, [phase.name]);

  // Sender name for trust banner (available once context is loaded)
  const senderName = 'ctx' in phase ? phase.ctx.senderName : undefined;

  // ── Date formatting ────────────────────────────────────────────────────────
  const dateLocale = locale === 'no' ? 'nb-NO' : 'en-US';
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-(--color-bg) flex flex-col">
      <TrustBanner senderName={senderName} s={s} />

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-10">
        {phase.name === 'loading' && (
          <SpinnerPage label={s.loading.document} />
        )}

        {phase.name === 'invalid_link' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <XCircle className="w-12 h-12 text-red-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">{s.invalidLink.heading}</h1>
            <p className="mt-2 text-sm text-(--color-text-secondary) max-w-sm">{s.invalidLink.body}</p>
          </div>
        )}

        {phase.name === 'offer_expired' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <XCircle className="w-12 h-12 text-amber-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">{s.expired.heading}</h1>
            <p className="mt-2 text-sm text-(--color-text-secondary) max-w-sm">
              {s.expired.body}
              {phase.expiresAt && <> {s.expired.expiredOn(fmtDate(phase.expiresAt))}</>}
            </p>
          </div>
        )}

        {phase.name === 'already_terminal' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            {phase.reason === 'OFFER_ALREADY_ACCEPTED' ? (
              <>
                <CheckCircle className="w-12 h-12 text-green-500 mb-4" aria-hidden="true" />
                <h1 className="text-xl font-semibold text-gray-900">{s.alreadyTerminal.acceptedHeading}</h1>
                <p className="mt-2 text-sm text-(--color-text-secondary) max-w-sm">
                  {phase.acceptedAt
                    ? s.alreadyTerminal.acceptedBody(fmtDate(phase.acceptedAt))
                    : s.alreadyTerminal.acceptedBodyFallback}
                </p>
                {phase.certificateId && (
                  <a
                    href={`/verify/${encodeURIComponent(phase.certificateId)}`}
                    className="mt-4 text-sm font-medium text-(--color-accent) hover:underline"
                  >
                    {s.alreadyTerminal.viewCert}
                  </a>
                )}
              </>
            ) : (
              <>
                <Shield className="w-12 h-12 text-gray-400 mb-4" aria-hidden="true" />
                <h1 className="text-xl font-semibold text-gray-900">{s.alreadyTerminal.closedHeading}</h1>
                <p className="mt-2 text-sm text-(--color-text-secondary) max-w-sm">
                  {s.alreadyTerminal.closedBody}
                </p>
              </>
            )}
          </div>
        )}

        {phase.name === 'offer_view' && (
          <>
            {phase.declineError && (
              <Alert variant="error" className="mb-4">
                {phase.declineError}
              </Alert>
            )}
            <OfferView ctx={phase.ctx} s={s} onContinue={handleContinue} onDecline={handleDecline} dateLocale={dateLocale} />
          </>
        )}

        {phase.name === 'otp_requesting' && (
          <SpinnerPage label={s.loading.sendingCode} />
        )}

        {(phase.name === 'otp_entry' || phase.name === 'otp_error') && (
          <OtpEntry
            ctx={phase.ctx}
            otp={phase.otp}
            codeRef={codeRef}
            s={s}
            error={phase.name === 'otp_error' ? phase.message : undefined}
            locked={phase.name === 'otp_error' ? phase.locked : false}
            expired={phase.name === 'otp_error' ? phase.expired : false}
            onSubmit={() => handleVerifyCode(phase.otp)}
            onResend={handleContinue}
          />
        )}

        {phase.name === 'otp_verifying' && (
          <SpinnerPage label={s.loading.verifyingCode} />
        )}

        {phase.name === 'otp_verified' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4" aria-hidden="true">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{s.otpVerified.heading}</h1>
            <p className="mt-2 text-sm text-(--color-text-muted)">{s.otpVerified.body}</p>
          </div>
        )}

        {phase.name === 'acceptance' && (
          <AcceptanceView
            ctx={phase.ctx}
            challengeId={phase.challengeId}
            s={s}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}

        {phase.name === 'accepting' && (
          <SpinnerPage label={s.loading.recording} />
        )}

        {phase.name === 'completed' && (
          <CompletedView
            acceptedAt={phase.acceptedAt}
            certificateId={phase.certificateId}
            senderName={phase.senderName}
            s={s}
            locale={locale}
          />
        )}

        {phase.name === 'declined' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <XCircle className="w-12 h-12 text-gray-400 mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-gray-900">{s.declined.heading}</h1>
            <p className="mt-2 text-sm text-(--color-text-secondary) max-w-sm">
              {s.declined.body(phase.senderName)}
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
  s,
  onContinue,
  onDecline,
  dateLocale,
}: {
  ctx: OfferContext;
  s: Strings;
  onContinue: () => void;
  onDecline: () => void;
  dateLocale: string;
}) {
  return (
    <div>
      {/* 1 — Sender identity */}
      <div className="mb-5">
        <p className="text-xs text-(--color-text-muted) uppercase tracking-wider mb-1">{s.offerView.sentBy}</p>
        <h1 className="text-xl font-bold text-(--color-text-primary) mb-0.5">{ctx.senderName}</h1>
        <p className="font-serif text-2xl text-(--color-text-secondary)">{ctx.offerTitle}</p>
        <p className="mt-2 text-sm text-(--color-text-muted) leading-relaxed">
          {s.offerView.identitySentence(ctx.senderName)}
        </p>
      </div>

      {ctx.offerMessage && (
        <p className="whitespace-pre-wrap text-sm text-(--color-text-secondary) leading-relaxed mb-4">{ctx.offerMessage}</p>
      )}

      {ctx.expiresAt && (
        <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
          <span aria-hidden="true">⏰</span>{' '}
          {s.offerView.expiresOn(
            new Date(ctx.expiresAt).toLocaleDateString(dateLocale, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            }),
          )}
        </p>
      )}

      {/* 2 — Document context */}
      {ctx.documents.length > 0 && (
        <div className="mt-2">
          <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
            {s.offerView.documentsIncluded(ctx.documents.length)}
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

      {/* 3 — Platform verification */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-600 leading-relaxed">
          {s.offerView.platformBox(ctx.senderName)}
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="primary" size="md" onClick={onContinue} leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}>
          {s.offerView.continueBtn}
        </Button>
        <Button variant="ghost" size="md" onClick={onDecline} className="text-(--color-text-secondary)">
          {s.offerView.declineBtn}
        </Button>
      </div>
    </div>
  );
}

function OtpEntry({
  ctx,
  otp,
  codeRef,
  s,
  error,
  locked,
  expired,
  onSubmit,
  onResend,
}: {
  ctx: OfferContext;
  otp: OtpResult;
  codeRef: React.RefObject<HTMLInputElement | null>;
  s: Strings;
  error?: string;
  locked: boolean;
  expired: boolean;
  onSubmit: () => void;
  onResend: () => void;
}) {
  const inputBlocked = locked || expired;

  const expiresAtTime = new Date(otp.expiresAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card>
      <CardHeader title={s.otp.heading} border />
      <CardSection>
        {/* ── Why we ask for a code ──────────────────────────────────────────── */}
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 mb-4">
          <p className="text-xs font-semibold text-blue-800 mb-1">{s.otp.whyTitle}</p>
          <p className="text-xs text-blue-700 leading-relaxed">{s.otp.whyBody}</p>
        </div>

        {/* ── Article 14 GDPR notice ─────────────────────────────────────────── */}
        <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-bg) px-4 py-3 mb-5">
          <p className="text-xs font-semibold text-(--color-text-primary) mb-1.5">
            {s.otp.gdprTitle}
          </p>
          <p className="text-xs text-(--color-text-secondary) mb-1.5">
            {s.otp.gdprSentBy(ctx.senderName)}
          </p>
          <p className="text-xs text-(--color-text-secondary) mb-1">
            {s.otp.gdprIfConfirm}
          </p>
          <ul className="text-xs text-(--color-text-muted) space-y-0.5 mb-2 pl-1">
            {s.otp.gdprItems.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
          <p className="text-xs text-(--color-text-secondary) mb-1.5">
            {s.otp.gdprBasis}
          </p>
          <a
            href="/privacy"
            className="text-xs text-(--color-accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
          >
            {s.otp.gdprLink}
          </a>
        </div>

        <p className="text-sm text-(--color-text-secondary) mb-1">
          {s.otp.sentTo(otp.deliveryAddressMasked)}{' '}
          <strong className="text-gray-900">{otp.deliveryAddressMasked}</strong>.
        </p>
        <p className="text-sm text-(--color-text-secondary) mb-4">
          {s.otp.verifyingAddress(ctx.senderName)}
        </p>

        {/* Wrong-code error — only shown when neither locked nor expired */}
        {error && !inputBlocked && (
          <Alert variant="error" className="mb-4">{error}</Alert>
        )}

        {/* Locked: too many wrong attempts */}
        {locked && (
          <Alert variant="error" className="mb-4">{s.otp.lockedMsg}</Alert>
        )}

        {/* Expired: code TTL elapsed — give a clear inline recovery path */}
        {expired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
            <p className="text-sm font-semibold text-amber-800">{s.otp.expiredHeading}</p>
            <p className="text-sm text-amber-700 mt-1">
              {s.otp.expiredBody}{' '}
              <button
                type="button"
                onClick={onResend}
                className="font-semibold underline underline-offset-2 hover:text-amber-900"
              >
                {s.otp.expiredResend}
              </button>
            </p>
          </div>
        )}

        {/* Code entry — hidden when code is no longer usable */}
        {!inputBlocked && (
          <div className="flex items-end gap-3">
            <div>
              <label htmlFor="otp-code" className="block text-xs font-medium text-gray-700 mb-1">
                {s.otp.codeLabel}
                <span className="ml-2 font-normal text-gray-400">
                  {s.otp.codeExpires(expiresAtTime)}
                </span>
              </label>
              <input
                id="otp-code"
                ref={codeRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                className="block w-36 rounded-lg border border-(--color-border) px-3 py-2.5 text-center text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:border-transparent"
                placeholder="——————"
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              />
            </div>
            <Button variant="primary" size="md" onClick={onSubmit}>
              {s.otp.verifyBtn}
            </Button>
          </div>
        )}
      </CardSection>

      {/* Footer resend link — hidden when the expired block already shows an inline CTA */}
      {!expired && (
        <CardFooter>
          <button
            type="button"
            onClick={onResend}
            className="text-sm text-(--color-accent) hover:underline"
          >
            {s.otp.resendLink}
          </button>
        </CardFooter>
      )}
    </Card>
  );
}

function AcceptanceView({
  ctx,
  challengeId,
  s,
  onAccept,
  onDecline,
}: {
  ctx: OfferContext;
  challengeId: string;
  s: Strings;
  onAccept: (challengeId: string) => void;
  onDecline: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-(--color-text-primary) mb-2">{s.acceptance.heading}</h2>
      <p className="text-sm text-(--color-text-secondary) mb-3">{s.acceptance.subheading}</p>

      <div className="border-l-4 border-(--color-accent) bg-(--color-accent-soft) px-5 py-4 rounded-r-xl mb-6">
        <p className="text-sm text-(--color-text-primary) italic leading-relaxed">{ctx.acceptanceStatement}</p>
      </div>

      {/* ── Legal disclosure ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-bg) px-4 py-4 mb-5">
        <p className="text-sm font-medium text-(--color-text-primary) mb-2">
          {s.acceptance.disclosureTitle}
        </p>
        <ul className="space-y-1.5 mb-3" aria-label="Acceptance confirmation items">
          {s.acceptance.disclosureItems.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-(--color-text-secondary)">
              <span className="mt-1 w-1 h-1 rounded-full bg-(--color-accent) flex-shrink-0" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs text-(--color-text-muted) leading-relaxed">
          {s.acceptance.disclosureFooter}
        </p>
        <p className="text-xs text-(--color-text-muted) leading-relaxed mt-1.5">
          {s.acceptance.eidasNote}
        </p>
      </div>

      {/* ── Pre-accept clarity strip ──────────────────────────────────────────── */}
      <div className="pl-3 border-l-2 border-(--color-border) flex flex-col gap-1 mb-5">
        <p className="text-sm font-medium text-(--color-text-primary)">{s.acceptance.clarityLine1}</p>
        <p className="text-sm text-(--color-text-secondary)">{s.acceptance.clarityLine2}</p>
        <p className="text-sm text-(--color-text-secondary)">{s.acceptance.clarityLine3}</p>
      </div>

      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={() => onAccept(challengeId)}
          leftIcon={<CheckCircle className="w-4 h-4" aria-hidden="true" />}
          className="bg-(--color-success) hover:bg-(--color-success-text) focus-visible:ring-(--color-success)"
        >
          {s.acceptance.acceptBtn}
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={onDecline}
          className="text-(--color-text-secondary)"
          aria-label={s.acceptance.declineBtn}
        >
          {s.acceptance.declineBtn}
        </Button>
      </div>
    </div>
  );
}

function CompletedView({
  acceptedAt,
  certificateId,
  senderName,
  s,
  locale,
}: {
  acceptedAt: string;
  certificateId: string | null;
  senderName: string;
  s: Strings;
  locale: Locale;
}) {
  const dateLocale = locale === 'no' ? 'nb-NO' : 'en-US';

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4 animate-fade-in">

      {/* ── Animated checkmark icon ─────────────────────────────────────────── */}
      <div
        className="w-24 h-24 rounded-full bg-(--color-success) flex items-center justify-center mb-7
                   ring-4 ring-(--color-success-border) animate-pulse-ring shadow-xl"
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

      <h1 className="text-3xl font-bold text-gray-900 mb-3">{s.completed.heading}</h1>
      <p className="text-base text-gray-700 font-medium max-w-sm mb-2">{s.completed.subheading}</p>
      <p className="text-sm text-(--color-text-secondary) max-w-sm mb-6">
        {s.completed.acceptedOn}{' '}
        <time dateTime={acceptedAt} className="font-medium text-gray-900">
          {new Date(acceptedAt).toLocaleString(dateLocale, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
        .
      </p>

      {/* ── Certificate notice ───────────────────────────────────────────────── */}
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
            <p className="text-sm font-semibold text-green-800 mb-2">{s.completed.certTitle}</p>
            <p className="text-xs text-green-700 leading-relaxed mb-2">{s.completed.certBody}</p>
            <ul className="text-xs text-green-700 space-y-1 mb-2">
              {s.completed.certItems.map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <span className="mt-0.5 flex-shrink-0" aria-hidden="true">·</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-xs text-green-700 leading-relaxed">{s.completed.certVerify}</p>
            <p className="text-xs text-green-700 leading-relaxed mt-1.5">
              {senderName ? s.completed.certSentTo(senderName) : s.completed.certSentToFallback}
            </p>
          </div>
        </div>
      </div>

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
          {s.completed.viewCert}
        </a>
      )}

      <p className="text-xs text-(--color-text-muted)">{s.completed.trustFooter}</p>
    </div>
  );
}
