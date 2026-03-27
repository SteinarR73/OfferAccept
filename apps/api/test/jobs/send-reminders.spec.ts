import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SendRemindersHandler } from '../../src/modules/jobs/handlers/send-reminders.handler';
import { EMAIL_PORT } from '../../src/common/email/email.port';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import { createHash } from 'crypto';

// ─── SendRemindersHandler — token rotation safety tests ───────────────────────
//
// Critical invariant (see handler comment block for full rationale):
//
//   tokenHash MUST NOT be written to the DB unless and until the reminder
//   email has been successfully accepted by the email provider.
//
// Failure to uphold this invariant leaves the recipient with:
//   - The OLD signing link dead (tokenHash replaced in DB)
//   - No replacement link delivered (email send failed)
//   - No way to sign the offer without contacting support
//
// These tests verify:
//   1. Success path — tokenHash is rotated, and the stored hash is derived from
//      exactly the raw token that was embedded in the delivered email URL.
//   2. Failure path — email failure leaves tokenHash unchanged in DB (no update
//      call at all).
//   3. Repeated failure (retry) — tokenHash still unchanged after N failures.
//   4. Partial-failure recovery — a later successful sweep correctly rotates
//      after prior failures.
//   5. Schedule advance — schedule IS advanced on success, NOT on failure.
//   6. Stale schedule self-heal — non-SENT offer deletes schedule and skips.
//   7. Missing data — no recipient/snapshot skips without a write or throw.
//   8. Final reminder — reminderCount reaches 3 and nextReminderAt is null.

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OFFER_ID     = 'offer-1';
const RECIPIENT_ID = 'recipient-1';
const SCHEDULE_ID  = 'schedule-1';

const NOW          = new Date('2026-03-26T10:00:00Z');
const DEAL_SENT_AT = new Date('2026-03-25T10:00:00Z'); // 24 h ago → R1 due

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    status: 'SENT',
    expiresAt: null,
    recipient: {
      id: RECIPIENT_ID,
      email: 'alice@example.com',
      name: 'Alice',
      status: 'PENDING',
    },
    snapshot: {
      title: 'Q1 SaaS Agreement',
      senderName: 'Bob Sender',
      expiresAt: null,
    },
    ...overrides,
  };
}

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    offerId: OFFER_ID,
    dealSentAt: DEAL_SENT_AT,
    reminderCount: 0,
    nextReminderAt: new Date(NOW.getTime() - 1000), // 1 s in the past → due
    warning24hSentAt: null,
    warning2hSentAt: null,
    offer: makeOffer(),
    ...overrides,
  };
}

// ─── Mock factories ───────────────────────────────────────────────────────────

type DbMock = {
  reminderSchedule: {
    findMany:   ReturnType<typeof jest.fn>;
    update:     ReturnType<typeof jest.fn>;
    delete:     ReturnType<typeof jest.fn>;
    deleteMany: ReturnType<typeof jest.fn>;
  };
  offerRecipient: {
    update: ReturnType<typeof jest.fn>;
  };
  offer: {
    findUnique: ReturnType<typeof jest.fn>;
  };
  $transaction: ReturnType<typeof jest.fn>;
};

function makeDb(schedules: ReturnType<typeof makeSchedule>[], offerStatusAtRecheck = 'SENT'): DbMock {
  const db: DbMock = {
    reminderSchedule: {
      findMany:   jest.fn<() => Promise<typeof schedules>>().mockResolvedValue(schedules),
      update:     jest.fn<() => Promise<object>>().mockResolvedValue({}),
      delete:     jest.fn<() => Promise<object>>().mockResolvedValue({}),
      deleteMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
    },
    offerRecipient: {
      update: jest.fn<() => Promise<object>>().mockResolvedValue({}),
    },
    offer: {
      findUnique: jest.fn<() => Promise<{ status: string } | null>>()
        .mockResolvedValue({ status: offerStatusAtRecheck }),
    },
    $transaction: jest.fn(),
  };
  // The $transaction callback receives the same mock as `tx`, so all method
  // calls inside the handler's transaction are visible on the same mock instance.
  (db.$transaction as ReturnType<typeof jest.fn>).mockImplementation(
    async (fn: (tx: DbMock) => Promise<unknown>) => fn(db),
  );
  return db;
}

type EmailMock = {
  sendRecipientReminder: ReturnType<typeof jest.fn>;
  sendExpiryWarning: ReturnType<typeof jest.fn>;
  [key: string]: ReturnType<typeof jest.fn>;
};

function makeEmailPort(): EmailMock {
  return {
    sendRecipientReminder:               jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendExpiryWarning:                   jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendOtp:                             jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendOfferLink:                       jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendAcceptanceConfirmationToSender:  jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendAcceptanceConfirmationToRecipient: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendDeclineNotification:             jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendExpiryNotification:              jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendEmailVerification:               jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendPasswordReset:                   jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendPasswordChanged:                 jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendOrgInvite:                       jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

async function buildHandler(db: DbMock, email: EmailMock): Promise<SendRemindersHandler> {
  const module = await Test.createTestingModule({
    providers: [
      SendRemindersHandler,
      { provide: 'PRISMA', useValue: db },
      { provide: EMAIL_PORT, useValue: email },
      { provide: ConfigService, useValue: { getOrThrow: () => 'https://app.test' } },
      { provide: DealEventService, useValue: { emit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
    ],
  }).compile();

  return module.get(SendRemindersHandler);
}

// Helper: extract the first arg from a jest mock call as an unknown record.
// Using `unknown[]` avoids TS tuple-length errors on zero-param mock types.
function firstCallArg(mockFn: ReturnType<typeof jest.fn>): Record<string, unknown> {
  const calls = mockFn.mock.calls as unknown[][];
  if (calls.length === 0) throw new Error('Mock was never called');
  return calls[0][0] as Record<string, unknown>;
}

async function runSweep(handler: SendRemindersHandler): Promise<void> {
  await handler.handle([]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Success path
// ─────────────────────────────────────────────────────────────────────────────

describe('SendRemindersHandler — success path', () => {
  it('sends the reminder email', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).toHaveBeenCalledTimes(1);
  });

  it('rotates tokenHash in DB after a successful email send', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(db.offerRecipient.update).toHaveBeenCalledTimes(1);
    expect(db.offerRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({ tokenHash: expect.any(String) }),
      }),
    );
  });

  it('the tokenHash written to DB is exactly SHA-256 of the raw token embedded in the email URL', async () => {
    // This test verifies the two halves match: the URL the recipient receives
    // must resolve to the hash stored in the DB. If they diverge, the link
    // won't work even though the email was delivered.
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    let capturedSigningUrl = '';
    email.sendRecipientReminder.mockImplementation(async (params: unknown) => {
      capturedSigningUrl = (params as { signingUrl: string }).signingUrl;
    });

    await runSweep(handler);

    expect(capturedSigningUrl).toMatch(/^https:\/\/app\.test\/sign\/oa_/);
    const rawToken = capturedSigningUrl.replace('https://app.test/sign/', '');
    const expectedHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');

    const updateArg = firstCallArg(db.offerRecipient.update);
    const data = updateArg['data'] as { tokenHash: string };
    expect(data.tokenHash).toBe(expectedHash);
  });

  it('advances the schedule count after a successful send', async () => {
    const db = makeDb([makeSchedule({ reminderCount: 0 })]);
    const handler = await buildHandler(db, makeEmailPort());

    await runSweep(handler);

    expect(db.reminderSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderCount: 1 }),
      }),
    );
  });

  it('sets nextReminderAt to the R2 time after the first reminder', async () => {
    const db = makeDb([makeSchedule({ reminderCount: 0 })]);
    const handler = await buildHandler(db, makeEmailPort());

    await runSweep(handler);

    // R2 is at dealSentAt + 72 h
    const expected = new Date(DEAL_SENT_AT.getTime() + 72 * 60 * 60 * 1000);
    expect(db.reminderSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextReminderAt: expected }),
      }),
    );
  });

  it('sends variant "not_opened" for PENDING recipient', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'not_opened', reminderNumber: 1 }),
    );
  });

  it('sends variant "opened" for VIEWED recipient', async () => {
    const schedule = makeSchedule({
      offer: makeOffer({ recipient: { id: RECIPIENT_ID, email: 'alice@example.com', name: 'Alice', status: 'VIEWED' } }),
    });
    const db = makeDb([schedule]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'opened' }),
    );
  });

  it('sends variant "otp_started" for OTP_VERIFIED recipient', async () => {
    const schedule = makeSchedule({
      offer: makeOffer({ recipient: { id: RECIPIENT_ID, email: 'alice@example.com', name: 'Alice', status: 'OTP_VERIFIED' } }),
    });
    const db = makeDb([schedule]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'otp_started' }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Failure path — email provider rejects
// ─────────────────────────────────────────────────────────────────────────────

describe('SendRemindersHandler — email failure: tokenHash must not be rotated', () => {
  it('does NOT call offerRecipient.update when the email send fails', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    email.sendRecipientReminder.mockRejectedValue(new Error('Provider 502'));
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    // The single assertion for the critical invariant:
    // no write to offerRecipient means the old tokenHash is unchanged in DB.
    expect(db.offerRecipient.update).not.toHaveBeenCalled();
  });

  it('does NOT advance the schedule when the email send fails', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    email.sendRecipientReminder.mockRejectedValue(new Error('Timeout'));
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    // reminderSchedule.update may be called for other reasons (expiry warnings),
    // but must not be called with a reminderCount update.
    const reminderCountUpdates = (db.reminderSchedule.update.mock.calls as unknown[][]).filter(
      (args) => {
        const arg = args[0] as { data?: { reminderCount?: number } };
        return arg.data?.reminderCount !== undefined;
      },
    );
    expect(reminderCountUpdates).toHaveLength(0);
  });

  it('does not throw when email fails — sweep continues without crashing', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    email.sendRecipientReminder.mockRejectedValue(new Error('5xx'));
    const handler = await buildHandler(db, email);

    await expect(runSweep(handler)).resolves.not.toThrow();
  });

  it('processes subsequent schedules even when one email fails', async () => {
    // Two schedules: first fails, second succeeds.
    const failSchedule  = makeSchedule({ id: 'schedule-fail', offerId: 'offer-fail',
      offer: makeOffer({ id: 'offer-fail' }) });
    const passSchedule  = makeSchedule({ id: 'schedule-ok', offerId: 'offer-ok',
      offer: makeOffer({ id: 'offer-ok', recipient: { id: 'recipient-ok',
        email: 'bob@example.com', name: 'Bob', status: 'PENDING' } }) });

    const db = makeDb([failSchedule, passSchedule]);
    const email = makeEmailPort();
    email.sendRecipientReminder
      .mockRejectedValueOnce(new Error('Transient failure'))
      .mockResolvedValueOnce(undefined);

    const handler = await buildHandler(db, email);
    await runSweep(handler);

    // Only the successful schedule should have written the tokenHash
    expect(db.offerRecipient.update).toHaveBeenCalledTimes(1);
    expect(db.offerRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'recipient-ok' } }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Repeated failure / retry idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('SendRemindersHandler — retry idempotency', () => {
  it('never writes tokenHash across N consecutive failed sweeps', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    email.sendRecipientReminder.mockRejectedValue(new Error('Persistent failure'));
    const handler = await buildHandler(db, email);

    await runSweep(handler);
    await runSweep(handler);
    await runSweep(handler);

    expect(db.offerRecipient.update).not.toHaveBeenCalled();
  });

  it('old tokenHash is never replaced after repeated failures — recipient link remains valid', async () => {
    // In the real system, signingTokenService looks up tokenHash by WHERE tokenHash=SHA256(rawToken).
    // As long as offerRecipient.update is never called with a new tokenHash,
    // the original link continues to match the stored hash and the recipient can sign.
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();
    email.sendRecipientReminder.mockRejectedValue(new Error('Persistent'));
    const handler = await buildHandler(db, email);

    await runSweep(handler);
    await runSweep(handler);

    // Confirmed: no update was ever made
    expect(db.offerRecipient.update).toHaveBeenCalledTimes(0);
  });

  it('recovers correctly when a later sweep succeeds after prior failures', async () => {
    const db = makeDb([makeSchedule()]);
    const email = makeEmailPort();

    email.sendRecipientReminder
      .mockRejectedValueOnce(new Error('Failure 1'))
      .mockRejectedValueOnce(new Error('Failure 2'))
      .mockResolvedValueOnce(undefined); // third sweep succeeds

    const handler = await buildHandler(db, email);

    await runSweep(handler); // fail — no write
    await runSweep(handler); // fail — no write
    await runSweep(handler); // success — write exactly once

    expect(db.offerRecipient.update).toHaveBeenCalledTimes(1);
    expect(db.offerRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({ tokenHash: expect.any(String) }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Stale schedule self-heal
// ─────────────────────────────────────────────────────────────────────────────

describe('SendRemindersHandler — stale schedule self-heal', () => {
  it.each(['ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'])(
    'deletes schedule and skips email when offer status is %s',
    async (status) => {
      const schedule = makeSchedule({
        offer: makeOffer({ status }),
      });
      const db = makeDb([schedule]);
      const email = makeEmailPort();
      const handler = await buildHandler(db, email);

      await runSweep(handler);

      expect(email.sendRecipientReminder).not.toHaveBeenCalled();
      expect(db.offerRecipient.update).not.toHaveBeenCalled();
      expect(db.reminderSchedule.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SCHEDULE_ID } }),
      );
    },
  );

  it('skips schedule when recipient is null — no email, no tokenHash write', async () => {
    const schedule = makeSchedule({
      offer: makeOffer({ recipient: null }),
    });
    const db = makeDb([schedule]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).not.toHaveBeenCalled();
    expect(db.offerRecipient.update).not.toHaveBeenCalled();
  });

  it('skips schedule when snapshot is null — no email, no tokenHash write', async () => {
    const schedule = makeSchedule({
      offer: makeOffer({ snapshot: null }),
    });
    const db = makeDb([schedule]);
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).not.toHaveBeenCalled();
    expect(db.offerRecipient.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Final reminder (R3) — schedule completed
// ─────────────────────────────────────────────────────────────────────────────

describe('SendRemindersHandler — final reminder', () => {
  it('sets nextReminderAt to null after the third reminder', async () => {
    const db = makeDb([makeSchedule({ reminderCount: 2 })]);
    const handler = await buildHandler(db, makeEmailPort());

    await runSweep(handler);

    expect(db.reminderSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderCount: 3, nextReminderAt: null }),
      }),
    );
  });

  it('still rotates tokenHash for the third reminder', async () => {
    const db = makeDb([makeSchedule({ reminderCount: 2 })]);
    const handler = await buildHandler(db, makeEmailPort());

    await runSweep(handler);

    expect(db.offerRecipient.update).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. No due schedules
// ─────────────────────────────────────────────────────────────────────────────

describe('SendRemindersHandler — empty sweep', () => {
  it('does nothing when there are no due schedules', async () => {
    const db = makeDb([]); // findMany returns []
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).not.toHaveBeenCalled();
    expect(db.offerRecipient.update).not.toHaveBeenCalled();
    expect(db.reminderSchedule.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Concurrent acceptance race — pre-send re-check
// ─────────────────────────────────────────────────────────────────────────────
//
// Scenario: the outer findMany saw offer.status = SENT, but by the time the
// handler reaches the pre-send $transaction re-check, acceptance has already
// committed (offer.status = ACCEPTED). The re-check must abort the send.

describe('SendRemindersHandler — concurrent acceptance race guard', () => {
  it('does NOT send email when re-check sees offer is ACCEPTED', async () => {
    const db = makeDb([makeSchedule()], 'ACCEPTED');
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).not.toHaveBeenCalled();
  });

  it('does NOT write tokenHash when re-check sees ACCEPTED', async () => {
    const db = makeDb([makeSchedule()], 'ACCEPTED');
    const handler = await buildHandler(db, makeEmailPort());

    await runSweep(handler);

    expect(db.offerRecipient.update).not.toHaveBeenCalled();
  });

  it('does NOT advance schedule counter when re-check sees ACCEPTED', async () => {
    const db = makeDb([makeSchedule()], 'ACCEPTED');
    const handler = await buildHandler(db, makeEmailPort());

    await runSweep(handler);

    const counterUpdates = (db.reminderSchedule.update.mock.calls as unknown[][]).filter(
      (args) => (args[0] as { data?: { reminderCount?: number } }).data?.reminderCount !== undefined,
    );
    expect(counterUpdates).toHaveLength(0);
  });

  it('calls deleteMany inside $transaction to clean up stale schedule on ACCEPTED', async () => {
    const db = makeDb([makeSchedule()], 'ACCEPTED');
    const handler = await buildHandler(db, makeEmailPort());

    await runSweep(handler);

    expect(db.reminderSchedule.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SCHEDULE_ID } }),
    );
  });

  it.each(['ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'])(
    'skips email for all terminal states at re-check (%s)',
    async (status) => {
      const db = makeDb([makeSchedule()], status);
      const email = makeEmailPort();
      const handler = await buildHandler(db, email);

      await runSweep(handler);

      expect(email.sendRecipientReminder).not.toHaveBeenCalled();
      expect(db.offerRecipient.update).not.toHaveBeenCalled();
    },
  );

  it('still sends email when re-check confirms offer is SENT', async () => {
    const db = makeDb([makeSchedule()], 'SENT');
    const email = makeEmailPort();
    const handler = await buildHandler(db, email);

    await runSweep(handler);

    expect(email.sendRecipientReminder).toHaveBeenCalledTimes(1);
  });

  it('does not throw when sweep completes without crashing', async () => {
    const db = makeDb([makeSchedule()], 'ACCEPTED');
    const handler = await buildHandler(db, makeEmailPort());

    await expect(runSweep(handler)).resolves.not.toThrow();
  });
});
