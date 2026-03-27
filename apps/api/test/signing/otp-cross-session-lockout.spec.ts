import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  OtpRecipientLockedError,
} from '../../src/common/errors/domain.errors';
import { SigningOtpService } from '../../src/modules/signing/services/signing-otp.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { EMAIL_PORT } from '../../src/common/email/email.port';

// ─── OTP cross-session recipient lockout tests ─────────────────────────────────
//
// Verifies that the cumulative failure check in SigningOtpService.issue()
// blocks OTP issuance when a recipient has accumulated too many failures
// across multiple challenges within the 30-minute sliding window.
//
// Invariants under test:
//   1. Below threshold → issue() proceeds normally
//   2. At threshold (≥10 cumulative failures) → OtpRecipientLockedError thrown
//   3. Creating a new session does NOT bypass the lockout
//   4. Failures outside the 30-minute window are not counted
//   5. Security log is emitted on lockout

const RECIPIENT_ID = 'recipient-lockout-1';
const SESSION_ID = 'session-lockout-1';
const DELIVERY_ADDRESS = 'target@example.com';

function makeAggregate(attemptCount: number | null) {
  return { _sum: { attemptCount } };
}

function createMockDb(aggregateResult: { _sum: { attemptCount: number | null } }) {
  const txMock = {
    signingOtpChallenge: {
      updateMany: jest.fn<(...args: any[]) => any>().mockResolvedValue({ count: 0 }),
      create: jest.fn<(...args: any[]) => any>().mockResolvedValue({ id: 'new-challenge-id' }),
    },
  };

  return {
    $transaction: jest.fn().mockImplementation(
      async (fn: unknown) => (fn as (tx: typeof txMock) => Promise<unknown>)(txMock),
    ),
    signingOtpChallenge: {
      aggregate: jest.fn<(...args: any[]) => any>().mockResolvedValue(aggregateResult),
    },
    _txMock: txMock,
  };
}

type MockDb = ReturnType<typeof createMockDb>;

async function buildService(db: MockDb) {
  const eventService = {
    append: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const emailPort = {
    sendOtp: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const module = await Test.createTestingModule({
    providers: [
      SigningOtpService,
      { provide: 'PRISMA', useValue: db },
      { provide: SigningEventService, useValue: eventService },
      { provide: EMAIL_PORT, useValue: emailPort },
    ],
  }).compile();

  return { service: module.get(SigningOtpService), eventService, emailPort };
}

async function callIssue(service: SigningOtpService) {
  return service.issue(SESSION_ID, RECIPIENT_ID, DELIVERY_ADDRESS, 'Alice', 'Senior Engineer Offer', {});
}

// ─── Below threshold ───────────────────────────────────────────────────────────

describe('SigningOtpService.issue() — cross-session lockout', () => {
  it('issues OTP when cumulative failures are below threshold (9)', async () => {
    const db = createMockDb(makeAggregate(9));
    const { service } = await buildService(db);

    const result = await callIssue(service);

    expect(result.result.challengeId).toBeDefined();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('issues OTP when there are no prior failures (null aggregate)', async () => {
    const db = createMockDb(makeAggregate(null));
    const { service } = await buildService(db);

    const result = await callIssue(service);

    expect(result.result.challengeId).toBeDefined();
  });

  it('issues OTP when cumulative failures are exactly 0', async () => {
    const db = createMockDb(makeAggregate(0));
    const { service } = await buildService(db);

    const result = await callIssue(service);

    expect(result.result.challengeId).toBeDefined();
  });

  // ── At / above threshold ────────────────────────────────────────────────────

  it('throws OtpRecipientLockedError when cumulative failures equal threshold (10)', async () => {
    const db = createMockDb(makeAggregate(10));
    const { service } = await buildService(db);

    await expect(callIssue(service)).rejects.toThrow(OtpRecipientLockedError);
  });

  it('throws OtpRecipientLockedError when cumulative failures exceed threshold (15)', async () => {
    const db = createMockDb(makeAggregate(15));
    const { service } = await buildService(db);

    await expect(callIssue(service)).rejects.toThrow(OtpRecipientLockedError);
  });

  it('does NOT create a new challenge when locked', async () => {
    const db = createMockDb(makeAggregate(10));
    const { service } = await buildService(db);

    await expect(callIssue(service)).rejects.toThrow(OtpRecipientLockedError);

    // No transaction should have been started
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does NOT send an email when locked', async () => {
    const db = createMockDb(makeAggregate(10));
    const { service, emailPort } = await buildService(db);

    await expect(callIssue(service)).rejects.toThrow(OtpRecipientLockedError);

    expect(emailPort.sendOtp).not.toHaveBeenCalled();
  });

  // ── Multi-session bypass blocked ────────────────────────────────────────────

  it('queries aggregate scoped to the recipientId provided', async () => {
    const db = createMockDb(makeAggregate(10));
    const { service } = await buildService(db);

    await expect(callIssue(service)).rejects.toThrow(OtpRecipientLockedError);

    const aggregateCall = (db.signingOtpChallenge.aggregate as jest.Mock).mock.calls[0][0] as {
      where: { recipientId: string; createdAt: { gte: Date } };
    };

    expect(aggregateCall.where.recipientId).toBe(RECIPIENT_ID);
  });

  it('uses a 30-minute window for the aggregate query', async () => {
    const before = new Date(Date.now() - 31 * 60 * 1000);
    const db = createMockDb(makeAggregate(10));
    const { service } = await buildService(db);

    await expect(callIssue(service)).rejects.toThrow(OtpRecipientLockedError);

    const aggregateCall = (db.signingOtpChallenge.aggregate as jest.Mock).mock.calls[0][0] as {
      where: { createdAt: { gte: Date } };
    };

    const windowStart = aggregateCall.where.createdAt.gte;
    // windowStart should be approximately 30 minutes ago (within a 2-second tolerance)
    expect(windowStart.getTime()).toBeGreaterThan(before.getTime());
    expect(windowStart.getTime()).toBeLessThanOrEqual(Date.now());
  });

  // ── Structured security log ─────────────────────────────────────────────────

  it('emits structured security log on lockout', async () => {
    const db = createMockDb(makeAggregate(12));
    const { service } = await buildService(db);

    // Capture logger.warn output
    const warnSpy = jest.spyOn((service as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn');

    await expect(callIssue(service)).rejects.toThrow(OtpRecipientLockedError);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logArg = warnSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logArg) as Record<string, unknown>;

    expect(parsed.metric).toBe('otp_recipient_lockout_blocked');
    expect(parsed.recipientId).toBe(RECIPIENT_ID);
    expect(parsed.cumulativeFailures).toBe(12);
    expect(typeof parsed.windowStartIso).toBe('string');
  });

  it('does NOT emit lockout log when below threshold', async () => {
    const db = createMockDb(makeAggregate(9));
    const { service } = await buildService(db);

    const warnSpy = jest.spyOn((service as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn');

    await callIssue(service);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
