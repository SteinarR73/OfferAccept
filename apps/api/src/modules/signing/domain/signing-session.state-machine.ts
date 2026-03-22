import { SessionStatus } from '@offeraccept/database';
import { StateMachine } from '../../../common/state-machine/state-machine';

// ─── SigningSession State Machine ─────────────────────────────────────────────
//
// A SigningSession represents one browser visit to the signing link.
// A recipient may have multiple sessions (e.g., two devices), but only one
// can reach ACCEPTED — the application enforces this by checking offer status
// before the acceptance transaction.
//
// States:
//   AWAITING_OTP   → session created; OTP sent; awaiting code verification
//   OTP_VERIFIED   → email confirmed; recipient may now submit acceptance
//   ACCEPTED       → offer accepted and AcceptanceRecord created  [terminal]
//   DECLINED       → recipient declined                           [terminal]
//   EXPIRED        → session TTL exceeded before completion       [terminal]
//   ABANDONED      → no meaningful activity within inactivity window  [terminal]
//
// Allowed transitions:
//   AWAITING_OTP → OTP_VERIFIED    (OTP successfully verified)
//   AWAITING_OTP → EXPIRED         (session TTL exceeded)
//   AWAITING_OTP → ABANDONED       (inactivity)
//   OTP_VERIFIED → ACCEPTED        (acceptance confirmed)
//   OTP_VERIFIED → DECLINED        (recipient declined)
//   OTP_VERIFIED → EXPIRED         (session TTL exceeded)
//   OTP_VERIFIED → ABANDONED       (inactivity)
//
// Invalid transitions (examples):
//   AWAITING_OTP → ACCEPTED  (must verify OTP first)
//   OTP_VERIFIED → AWAITING_OTP  (cannot un-verify)
//   Any terminal → anything  (terminal)
//
// SigningEvents emitted on transition:
//   → AWAITING_OTP (session created):  SESSION_STARTED
//   → OTP_VERIFIED:                    OTP_VERIFIED
//   → ACCEPTED:                        OFFER_ACCEPTED
//   → DECLINED:                        OFFER_DECLINED
//   → EXPIRED:                         SESSION_EXPIRED
//   → ABANDONED:                       SESSION_ABANDONED

const TERMINAL_SESSION_STATES: readonly SessionStatus[] = [
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'ABANDONED',
] as const;

export const sessionStateMachine = new StateMachine<SessionStatus>(
  {
    AWAITING_OTP: ['OTP_VERIFIED', 'EXPIRED', 'ABANDONED'],
    OTP_VERIFIED: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'ABANDONED'],
  },
  TERMINAL_SESSION_STATES,
  'SigningSession',
);
