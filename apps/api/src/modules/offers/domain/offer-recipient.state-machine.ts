import { RecipientStatus } from '@offeracept/database';
import { StateMachine } from '../../../common/state-machine/state-machine';

// ─── OfferRecipient State Machine ─────────────────────────────────────────────
//
// States:
//   PENDING      → offer sent; recipient has not yet opened the link
//   VIEWED       → link was opened and token was validated (session created)
//   OTP_VERIFIED → email OTP was verified in a signing session
//   ACCEPTED     → recipient accepted the offer                   [terminal]
//   DECLINED     → recipient explicitly declined                  [terminal]
//   EXPIRED      → offer expired before a terminal response       [terminal]
//
// Allowed transitions:
//   PENDING      → VIEWED                 (link opened, session created)
//   PENDING      → EXPIRED                (offer expired before first view)
//   VIEWED       → OTP_VERIFIED           (OTP verified in any session)
//   VIEWED       → DECLINED               (declined before OTP verification)
//   VIEWED       → EXPIRED                (offer expired after first view)
//   OTP_VERIFIED → ACCEPTED               (final acceptance confirmed)
//   OTP_VERIFIED → DECLINED               (declined after OTP verification)
//   OTP_VERIFIED → EXPIRED                (offer expired after OTP verification)
//
// Notes:
//   - OTP_VERIFIED is a sticky recipient-level state: once the inbox is proven
//     in any session, the recipient does not need to re-verify in a new session
//     for the same offer. The application layer enforces this.
//   - EXPIRED is set by a background job that runs on offer.expiresAt.
//   - VIEWED can transition back via a new session if recipient re-opens link,
//     but the status does not regress — VIEWED is idempotent (already VIEWED → VIEWED
//     is NOT a transition, it is a no-op).
//
// SigningEvents emitted:
//   PENDING → VIEWED:       SESSION_STARTED (in SigningSession context)
//   VIEWED  → OTP_VERIFIED: OTP_VERIFIED    (in SigningSession context)
//   *       → ACCEPTED:     OFFER_ACCEPTED  (in SigningSession context)
//   *       → DECLINED:     OFFER_DECLINED  (in SigningSession context)

const TERMINAL_RECIPIENT_STATES: readonly RecipientStatus[] = [
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
] as const;

export const recipientStateMachine = new StateMachine<RecipientStatus>(
  {
    PENDING: ['VIEWED', 'EXPIRED'],
    VIEWED: ['OTP_VERIFIED', 'DECLINED', 'EXPIRED'],
    OTP_VERIFIED: ['ACCEPTED', 'DECLINED', 'EXPIRED'],
  },
  TERMINAL_RECIPIENT_STATES,
  'OfferRecipient',
);
