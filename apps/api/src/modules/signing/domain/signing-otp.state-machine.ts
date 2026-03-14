import { OtpChallengeStatus } from '@offeracept/database';
import { StateMachine } from '../../../common/state-machine/state-machine';

// ─── SigningOtpChallenge State Machine ────────────────────────────────────────
//
// States:
//   PENDING      → challenge is active; code has been sent; awaiting submission
//   VERIFIED     → correct code submitted within TTL and attempt limit  [terminal]
//   EXPIRED      → expiresAt passed before successful verification      [terminal]
//   LOCKED       → maxAttempts reached without success                  [terminal]
//   INVALIDATED  → superseded by a new challenge for the same session   [terminal]
//
// Allowed transitions:
//   PENDING → VERIFIED     (correct code, within TTL, attemptCount < maxAttempts)
//   PENDING → EXPIRED      (expiresAt exceeded — set by application before verify check)
//   PENDING → LOCKED       (attemptCount reaches maxAttempts on a wrong guess)
//   PENDING → INVALIDATED  (a new OTP is issued, replacing this one)
//
// Note: all transitions out of PENDING are terminal. A challenge cannot be
// re-activated. To retry, a new challenge must be issued (which invalidates this one).
//
// SigningEvents emitted:
//   PENDING → LOCKED:      OTP_MAX_ATTEMPTS
//   PENDING → VERIFIED:    OTP_VERIFIED
//   (EXPIRED and INVALIDATED do not emit additional events beyond what created them)

const TERMINAL_OTP_STATES: readonly OtpChallengeStatus[] = [
  'VERIFIED',
  'EXPIRED',
  'LOCKED',
  'INVALIDATED',
] as const;

export const otpStateMachine = new StateMachine<OtpChallengeStatus>(
  {
    PENDING: ['VERIFIED', 'EXPIRED', 'LOCKED', 'INVALIDATED'],
  },
  TERMINAL_OTP_STATES,
  'SigningOtpChallenge',
);

// ─── Derived state helper ──────────────────────────────────────────────────────
// Called when a challenge record is loaded from the DB to compute the effective
// status before the stored status field is applied. This ensures consistency even
// if a background job has not yet run to mark expired challenges.
//
// Order of precedence: VERIFIED > INVALIDATED > LOCKED > EXPIRED > PENDING
export function deriveOtpStatus(challenge: {
  status: OtpChallengeStatus;
  verifiedAt: Date | null;
  invalidatedAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
}): OtpChallengeStatus {
  // Trust the stored terminal status if already set
  if (challenge.status !== 'PENDING') return challenge.status;

  // Derive current effective state for PENDING challenges
  if (challenge.verifiedAt !== null) return 'VERIFIED';
  if (challenge.invalidatedAt !== null) return 'INVALIDATED';
  if (challenge.attemptCount >= challenge.maxAttempts) return 'LOCKED';
  if (challenge.expiresAt <= new Date()) return 'EXPIRED';

  return 'PENDING';
}
