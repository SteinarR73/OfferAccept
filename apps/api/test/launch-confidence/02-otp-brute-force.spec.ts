/**
 * TEST 2 — OTP Brute Force
 *
 * Invariant: A signing OTP challenge locks after maxAttempts (5) incorrect
 * submissions. No further verification is possible after lockout.
 *
 * Strategy:
 *   - Submit WRONG_OTP_CODE repeatedly against a single challenge.
 *   - After maxAttempts failures, the challenge status transitions to LOCKED.
 *   - All attempts after lockout throw OtpLockedError immediately.
 *   - attemptCount in the mock state never exceeds maxAttempts.
 *
 * Additionally validates:
 *   - The 30-minute cross-session cumulative failure window (10 failures
 *     across sessions triggers OtpRecipientLockedError on the next issue()).
 */

import { SigningOtpService } from '../../src/modules/signing/services/signing-otp.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import {
  OtpLockedError,
  OtpInvalidError,
  OtpRecipientLockedError,
} from '../../src/common/errors/domain.errors';
import { createOtpDb, makeOtpState, WRONG_OTP_CODE, CORRECT_OTP_CODE } from './helpers/db.factory';
import { jest } from '@jest/globals';

const MAX_ATTEMPTS = 5;
const BRUTE_FORCE_ITERATIONS = 500;

function buildOtpService(db: ReturnType<typeof createOtpDb>) {
  const emailPort = { sendOtp: jest.fn<any>().mockResolvedValue(undefined) };
  const eventService = new SigningEventService(db as never);
  return new SigningOtpService(db as never, emailPort as never, eventService);
}

describe('TEST 2 — OTP Brute Force', () => {
  it('locks the challenge after exactly maxAttempts wrong codes', async () => {
    const state = makeOtpState();
    const db = createOtpDb(state);
    const svc = buildOtpService(db);
    const ctx = { ipAddress: '1.2.3.4', userAgent: 'attacker/bot' };

    let invalidErrors = 0;
    let lockedErrors = 0;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        await svc.verifyAndAdvanceSession('challenge-1', 'recipient-1', WRONG_OTP_CODE, ctx);
      } catch (err) {
        if (err instanceof OtpLockedError) lockedErrors++;
        else if (err instanceof OtpInvalidError) invalidErrors++;
        else throw err; // unexpected error — fail the test
      }
    }

    // First (maxAttempts - 1) attempts throw OtpInvalidError
    expect(invalidErrors).toBe(MAX_ATTEMPTS - 1);
    // Final attempt transitions to LOCKED and throws OtpLockedError
    expect(lockedErrors).toBe(1);

    // Challenge is now LOCKED
    expect(state.status).toBe('LOCKED');

    // attemptCount matches maxAttempts exactly — never exceeded
    expect(state.attemptCount).toBe(MAX_ATTEMPTS);
  });

  it('throws OtpLockedError immediately on any attempt after lockout', async () => {
    const state = makeOtpState({ status: 'LOCKED', attemptCount: 5 });
    const db = createOtpDb(state);
    const svc = buildOtpService(db);
    const ctx = { ipAddress: '1.2.3.4', userAgent: 'attacker/bot' };

    // All attempts post-lockout must throw OtpLockedError, nothing else
    for (let i = 0; i < 10; i++) {
      await expect(
        svc.verifyAndAdvanceSession('challenge-1', 'recipient-1', WRONG_OTP_CODE, ctx),
      ).rejects.toBeInstanceOf(OtpLockedError);
    }

    // attemptCount must not grow beyond maxAttempts
    expect(state.attemptCount).toBe(MAX_ATTEMPTS);
  });

  it(`simulates ${BRUTE_FORCE_ITERATIONS}-attempt storm: challenge locks, attemptCount never exceeds maxAttempts`, async () => {
    const state = makeOtpState();
    const db = createOtpDb(state);
    const svc = buildOtpService(db);
    const ctx = { ipAddress: '1.2.3.4', userAgent: 'scanner/1.0' };

    let lockedErrors = 0;

    for (let i = 0; i < BRUTE_FORCE_ITERATIONS; i++) {
      try {
        await svc.verifyAndAdvanceSession('challenge-1', 'recipient-1', WRONG_OTP_CODE, ctx);
      } catch (err) {
        if (err instanceof OtpLockedError) lockedErrors++;
        else if (!(err instanceof OtpInvalidError)) throw err;
      }
    }

    // Challenge is locked
    expect(state.status).toBe('LOCKED');

    // CRITICAL: attemptCount must never exceed maxAttempts
    expect(state.attemptCount).toBeLessThanOrEqual(MAX_ATTEMPTS);

    // At least one OtpLockedError was thrown (lockout was enforced)
    expect(lockedErrors).toBeGreaterThan(0);

    // Correct code is never accepted while locked
    await expect(
      svc.verifyAndAdvanceSession('challenge-1', 'recipient-1', CORRECT_OTP_CODE, ctx),
    ).rejects.toBeInstanceOf(OtpLockedError);
  });

  it('blocks OTP issuance when cross-session cumulative failures >= 10 within 30 min', async () => {
    const state = makeOtpState();
    const db = createOtpDb(state);

    // Override: aggregate returns 10 cumulative failures — triggers recipient lockout
    db.signingOtpChallenge.aggregate = jest.fn<any>().mockResolvedValue({
      _sum: { attemptCount: 10 },
    }) as unknown as typeof db.signingOtpChallenge.aggregate;

    const emailPort = { sendOtp: jest.fn<any>().mockResolvedValue(undefined) };
    const eventService = new SigningEventService(db as never);
    const svc = new SigningOtpService(db as never, emailPort as never, eventService);

    await expect(
      svc.issue('session-1', 'recipient-1', 'jane@example.com', 'Jane', 'Agreement', {}),
    ).rejects.toBeInstanceOf(OtpRecipientLockedError);

    // No OTP email was sent
    expect(emailPort.sendOtp).not.toHaveBeenCalled();
  });
});
