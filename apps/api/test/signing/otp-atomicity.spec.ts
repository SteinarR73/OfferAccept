import { jest } from '@jest/globals';
import * as crypto from 'crypto';
import { Test } from '@nestjs/testing';
import {
  OtpAlreadyVerifiedError,
  OtpChallengeMismatchError,
  OtpExpiredError,
  OtpLockedError,
  SessionExpiredError,
} from '../../src/common/errors/domain.errors';
import { SigningOtpService } from '../../src/modules/signing/services/signing-otp.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { EMAIL_PORT } from '../../src/common/email/email.port';

// ─── OTP atomicity tests ───────────────────────────────────────────────────────
//
// Verifies that verifyAndAdvanceSession() is a single atomic domain operation:
//   - On success: challenge VERIFIED + session OTP_VERIFIED + recipient OTP_VERIFIED
//     + OTP_VERIFIED event all happen in one $transaction.
//   - On any pre-condition failure: no state change at all.
//   - Duplicate verify attempts (already VERIFIED) → OtpAlreadyVerifiedError.
//   - Challenge bound to wrong recipient → OtpChallengeMismatchError.
//   - Missing challenge → OtpChallengeMismatchError.
//   - Session expired or wrong state → SessionExpiredError.

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

const CORRECT_CODE = '654321';
const CHALLENGE_ID = 'challenge-atomic-1';
const SESSION_ID = 'session-atomic-1';
const RECIPIENT_ID = 'recipient-atomic-1';

function makeChallenge(overrides: Record<string, unknown> = {}) {
  return {
    id: CHALLENGE_ID,
    sessionId: SESSION_ID,
    recipientId: RECIPIENT_ID,
    channel: 'EMAIL',
    deliveryAddress: 'test@example.com',
    codeHash: hashCode(CORRECT_CODE),
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attemptCount: 0,
    maxAttempts: 5,
    verifiedAt: null,
    invalidatedAt: null,
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    recipientId: RECIPIENT_ID,
    offerId: 'offer-1',
    snapshotId: 'snap-1',
    status: 'AWAITING_OTP',
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    ...overrides,
  };
}

// ─── Setup ─────────────────────────────────────────────────────────────────────

function createMockDb() {
  const txMock = {
    signingOtpChallenge: { update: jest.fn() },
    signingSession: { update: jest.fn(), updateMany: jest.fn() },
    offerRecipient: { update: jest.fn(), updateMany: jest.fn() },
  };

  return {
    $transaction: jest.fn().mockImplementation(async (fn: unknown) => (fn as (tx: typeof txMock) => Promise<unknown>)(txMock)),
    signingOtpChallenge: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    signingSession: {
      findUnique: jest.fn(),
    },
    offerRecipient: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    _txMock: txMock, // exposed for assertion
  };
}

type MockDb = ReturnType<typeof createMockDb>;

async function buildService(db: MockDb) {
  const eventService = {
    append: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const module = await Test.createTestingModule({
    providers: [
      SigningOtpService,
      { provide: 'PRISMA', useValue: db },
      { provide: SigningEventService, useValue: eventService },
      { provide: EMAIL_PORT, useValue: { sendOtp: jest.fn() } },
    ],
  }).compile();

  return { service: module.get(SigningOtpService), eventService };
}

// ─── Happy path ────────────────────────────────────────────────────────────────

describe('SigningOtpService.verifyAndAdvanceSession() — happy path', () => {
  it('runs challenge + session + recipient + event updates in a single $transaction', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge() as never);
    db.signingSession.findUnique.mockResolvedValue(makeSession() as never);
    db.offerRecipient.findUnique.mockResolvedValue({ id: RECIPIENT_ID, version: 1 } as never);
    (db._txMock.signingOtpChallenge.update as jest.Mock<(...args: any[]) => any>).mockResolvedValue({});
    (db._txMock.signingSession.updateMany as jest.Mock<(...args: any[]) => any>).mockResolvedValue({ count: 1 });
    (db._txMock.offerRecipient.updateMany as jest.Mock<(...args: any[]) => any>).mockResolvedValue({ count: 1 });

    const { service, eventService } = await buildService(db);
    const result = await service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {});

    expect(result.verified).toBe(true);
    expect(result.verifiedAt).toBeInstanceOf(Date);

    // Exactly one $transaction must have been called
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    // All three state updates happen inside the transaction
    expect(db._txMock.signingOtpChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'VERIFIED' }) }),
    );
    expect(db._txMock.signingSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'OTP_VERIFIED' }) }),
    );
    expect(db._txMock.offerRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'OTP_VERIFIED' }) }),
    );

    // OTP_VERIFIED event appended exactly once inside the transaction
    expect(eventService.append).toHaveBeenCalledTimes(1);
    expect(eventService.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'OTP_VERIFIED', sessionId: SESSION_ID }),
      expect.anything(), // the tx object
    );
  });

  it('sets otpVerifiedAt on the session update', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge() as never);
    db.signingSession.findUnique.mockResolvedValue(makeSession() as never);
    db.offerRecipient.findUnique.mockResolvedValue({ id: RECIPIENT_ID, version: 1 } as never);
    (db._txMock.signingOtpChallenge.update as jest.Mock<(...args: any[]) => any>).mockResolvedValue({});
    (db._txMock.signingSession.updateMany as jest.Mock<(...args: any[]) => any>).mockResolvedValue({ count: 1 });
    (db._txMock.offerRecipient.updateMany as jest.Mock<(...args: any[]) => any>).mockResolvedValue({ count: 1 });

    const { service } = await buildService(db);
    await service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {});

    const sessionUpdateCall = ((db._txMock.signingSession.updateMany as jest.Mock).mock.calls as unknown[][])[0][0] as {
      data: { status: string; otpVerifiedAt: Date };
    };
    expect(sessionUpdateCall.data.otpVerifiedAt).toBeInstanceOf(Date);
  });
});

// ─── Pre-condition failures — no state change ──────────────────────────────────

describe('SigningOtpService.verifyAndAdvanceSession() — pre-condition failures', () => {
  it('throws OtpChallengeMismatchError when challenge does not exist', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(null as never);

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(OtpChallengeMismatchError);

    // No transaction must have been started
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge.recipientId does not match', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(
      makeChallenge({ recipientId: 'different-recipient' }) as never,
    );

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(OtpChallengeMismatchError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws OtpAlreadyVerifiedError when challenge is already VERIFIED', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(
      makeChallenge({ status: 'VERIFIED', verifiedAt: new Date() }) as never,
    );

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(OtpAlreadyVerifiedError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws OtpExpiredError when challenge TTL has passed', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(
      makeChallenge({ expiresAt: new Date(Date.now() - 1000) }) as never,
    );

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(OtpExpiredError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws OtpLockedError when challenge is LOCKED', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(
      makeChallenge({ status: 'LOCKED', attemptCount: 5 }) as never,
    );

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(OtpLockedError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws SessionExpiredError when session does not exist', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge() as never);
    db.signingSession.findUnique.mockResolvedValue(null as never);

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(SessionExpiredError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws SessionExpiredError when session is not AWAITING_OTP', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge() as never);
    // Session is already OTP_VERIFIED — cannot re-verify
    db.signingSession.findUnique.mockResolvedValue(makeSession({ status: 'OTP_VERIFIED' }) as never);

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(SessionExpiredError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws SessionExpiredError when session TTL has passed', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge() as never);
    db.signingSession.findUnique.mockResolvedValue(
      makeSession({ expiresAt: new Date(Date.now() - 1000) }) as never,
    );

    const { service } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, CORRECT_CODE, {}),
    ).rejects.toThrow(SessionExpiredError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ─── Incorrect code — partial failure path ─────────────────────────────────────

describe('SigningOtpService.verifyAndAdvanceSession() — incorrect code', () => {
  it('increments attemptCount but does NOT advance session or recipient on wrong code', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge() as never);
    db.signingSession.findUnique.mockResolvedValue(makeSession() as never);
    db.offerRecipient.findUnique.mockResolvedValue({ id: RECIPIENT_ID, version: 1 } as never);
    (db._txMock.signingOtpChallenge.update as jest.Mock<(...args: any[]) => any>).mockResolvedValue({});

    const { service, eventService } = await buildService(db);

    await expect(
      service.verifyAndAdvanceSession(CHALLENGE_ID, RECIPIENT_ID, 'wrong-code', {}),
    ).rejects.toThrow();

    // Only the attempt count transaction ran (for the failed attempt)
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db._txMock.signingOtpChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attemptCount: 1 }) }),
    );

    // Session and recipient must NOT have been updated
    expect(db._txMock.signingSession.updateMany).not.toHaveBeenCalled();
    expect(db._txMock.offerRecipient.updateMany).not.toHaveBeenCalled();

    // Event should be a failure event, not OTP_VERIFIED
    expect(eventService.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'OTP_ATTEMPT_FAILED' }),
      expect.anything(),
    );
  });
});
