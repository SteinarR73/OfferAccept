import { OfferStatus } from '@offeraccept/database';
import { StateMachine } from '../../../common/state-machine/state-machine';

// ─── Offer State Machine ───────────────────────────────────────────────────────
//
// States:
//   DRAFT       → initial state; offer is being composed
//   SENT        → offer has been sent; snapshot frozen; token generated
//   ACCEPTED    → recipient accepted (after OTP verification)  [terminal]
//   DECLINED    → recipient explicitly declined                [terminal]
//   EXPIRED     → expiresAt passed without a response         [terminal]
//   REVOKED     → sender cancelled after sending              [terminal]
//
// Allowed transitions:
//   DRAFT   → SENT                             (sender sends the offer)
//   SENT    → ACCEPTED                         (recipient accepts)
//   SENT    → DECLINED                         (recipient declines)
//   SENT    → EXPIRED                          (background job on expiresAt)
//   SENT    → REVOKED                          (sender explicitly revokes)
//
// Invalid transitions (examples):
//   DRAFT   → ACCEPTED / DECLINED / EXPIRED / REVOKED   (must be sent first)
//   SENT    → DRAFT                                     (cannot un-send)
//   ACCEPTED / DECLINED / EXPIRED / REVOKED → anything  (terminal)
//
// SigningEvents emitted on transition:
//   (Offer status transitions are not emitted as SigningEvents — SigningEvents
//    record recipient actions. Offer status is changed as a side-effect of those
//    actions, e.g. OFFER_ACCEPTED event → Offer.status becomes ACCEPTED.)

const TERMINAL_OFFER_STATES: readonly OfferStatus[] = [
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'REVOKED',
] as const;

export const offerStateMachine = new StateMachine<OfferStatus>(
  {
    DRAFT: ['SENT'],
    SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'],
  },
  TERMINAL_OFFER_STATES,
  'Offer',
);
