import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  OfferExpiredError,
  OfferAlreadyAcceptedError,
  InvalidStateTransitionError,
} from '../../src/common/errors/domain.errors';
import { AcceptanceService } from '../../src/modules/signing/services/acceptance.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';

// ─── AcceptanceService — expiry race condition tests ──────────────────────────
//
// The acceptance flow has two checks against the offer status:
//
//   A. Pre-transaction fast-fail (lines 82-95 of acceptance.service.ts)
//      Reads offer status before the transaction opens. Catches the common
//      case cheaply, but is NOT atomic — it can be raced.
//
//   B. CAS inside the transaction (lines 119-129)
//      updateMany({ where: { id, status: 'SENT' } }) → count=0 means another
//      process already transitioned the offer. The authoritative check.
//
// The race: expire-offers job runs after A passes but before B executes.
//
// Invariants being tested here:
//   1. If the CAS returns 0 and the offer is now EXPIRED, OfferExpiredError is thrown.
//   2. No AcceptanceRecord is created when the CAS fails.
//   3. No signing event is appended when the CAS fails.
//   4. The happy path (CAS succeeds) creates the record and returns the correct shape.
//   5. REVOKED after CAS → InvalidStateTransitionError (not a false-positive EXPIRED).
//   6. ACCEPTED after CAS → OfferAlreadyAcceptedError (idempotent double-accept guard).
//   7. DB P2002 on snapshotId → OfferAlreadyAcceptedError (last-resort uniqueness net).
//   8. P2002 on other columns re-throws unchanged (not swallowed as already-accepted).

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION_ID   = 'session-race-1';
const RECIPIENT_ID = 'recipient-race-1';
const OFFER_ID     = 'offer-race-1';
const SNAPSHOT_ID  = 'snapshot-race-1';
const CHALLENGE_ID = 'challenge-race-1';
const ORG_ID       = 'org-race-1';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    recipientId: RECIPIENT_ID,
    offerId: OFFER_ID,
    snapshotId: SNAPSHOT_ID,
    status: 'OTP_VERIFIED',
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    startedAt: new Date(),
    completedAt: null,
    otpVerifiedAt: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeChallenge(overrides: Record<string, unknown> = {}) {
  return {
    id: CHALLENGE_ID,
    sessionId: SESSION_ID,
    recipientId: RECIPIENT_ID,
    status: 'VERIFIED',
    verifiedAt: new Date(),
    deliveryAddress: 'jane@example.com',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    organizationId: ORG_ID,
    status: 'SENT',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRecipient(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPIENT_ID,
    offerId: OFFER_ID,
    email: 'jane@example.com',
    name: 'Jane Smith',
    status: 'OTP_VERIFIED',
    respondedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: SNAPSHOT_ID,
    offerId: OFFER_ID,
    title: 'My Offer',
    senderName: 'Acme Corp',
    senderEmail: 'sender@acme.com',
    contentHash: 'abc' + '0'.repeat(61),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAcceptanceRecord() {
  return {
    id: 'record-race-1',
    sessionId: SESSION_ID,
    recipientId: RECIPIENT_ID,
    snapshotId: SNAPSHOT_ID,
    acceptanceStatement: 'I, Jane Smith, confirm...',
    verifiedEmail: 'jane@example.com',
    emailVerifiedAt: new Date(),
    acceptedAt: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    locale: null,
    timezone: null,
    snapshotContentHash: 'abc' + '0'.repeat(61),
    createdAt: new Date(),
  };
}

// ── Mock DB factory ────────────────────────────────────────────────────────────
//
// $transaction passes the same mock as the `tx` argument so that service code
// running inside the transaction callback uses the same mock instance.
// This lets us verify that transactional writes (acceptanceRecord.create,
// signingSession.update, signingEvent.create) did or did not execute.

function createMockDb() {
  const mock = {
    signingOtpChallenge: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(makeChallenge()),
    },
    offer: {
      findUniqueOrThrow: jest.fn<() => Promise<unknown>>().mockResolvedValue(makeOffer()),
      // Default: CAS succeeds. Tests override this with mockResolvedValueOnce({ count: 0 }).
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
    offerRecipient: {
      findUniqueOrThrow: jest.fn<() => Promise<unknown>>().mockResolvedValue(makeRecipient()),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue(makeRecipient()),
    },
    offerSnapshot: {
      findUniqueOrThrow: jest.fn<() => Promise<unknown>>().mockResolvedValue(makeSnapshot()),
    },
    acceptanceRecord: {
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue(makeAcceptanceRecord()),
    },
    signingSession: {
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue(makeSession({ status: 'ACCEPTED' })),
    },
    signingEvent: {
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: 'evt-1', sequenceNumber: 1, eventHash: 'h', previousEventHash: null, timestamp: new Date(),
      }),
      findFirst: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    },
    reminderSchedule: {
      deleteMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  };

  // The transaction callback receives the same mock as the `tx` argument.
  // This makes writes inside tx (acceptanceRecord.create, signingSession.update,
  // signingEvent.create) visible on the same mock the test assertions query.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mock.$transaction.mockImplementation(async (...args: any[]) => (args[0] as (tx: any) => Promise<unknown>)(mock));

  return mock;
}

type MockDb = ReturnType<typeof createMockDb>;

// ── Service builder ────────────────────────────────────────────────────────────

async function buildService(db: MockDb) {
  // SigningEventService uses $queryRaw + signingEvent.create/findFirst internally.
  // We inject the real SigningEventService with the mock DB so we can verify
  // whether append() was called via the signingEvent.create spy.
  const module = await Test.createTestingModule({
    providers: [
      AcceptanceService,
      SigningEventService,
      { provide: 'PRISMA', useValue: db },
    ],
  }).compile();

  return {
    service: module.get(AcceptanceService),
    db,
  };
}

const DEFAULT_CONTEXT = { ipAddress: '127.0.0.1', userAgent: 'jest' };

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('AcceptanceService.accept() — happy path', () => {
  it('creates AcceptanceRecord and returns full result when CAS succeeds', async () => {
    const { service, db } = await buildService(createMockDb());

    const result = await service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT);

    expect(result.acceptanceRecord.id).toBe('record-race-1');
    expect(result.offerId).toBe(OFFER_ID);
    expect(result.organizationId).toBe(ORG_ID);
    expect(result.recipientEmail).toBe('jane@example.com');
    expect(result.certificateId).toBeNull(); // certificate is generated by the caller, not here

    // CAS was called with status='SENT' guard
    expect(db.offer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'SENT' }) }),
    );
    expect(db.acceptanceRecord.create).toHaveBeenCalledTimes(1);
  });

  it('transitions offer, session, and recipient inside the transaction', async () => {
    const { service, db } = await buildService(createMockDb());

    await service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT);

    expect(db.offer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED' } }),
    );
    expect(db.signingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
    expect(db.offerRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    );
  });

  it('appends OFFER_ACCEPTED signing event inside the transaction', async () => {
    const { service, db } = await buildService(createMockDb());

    await service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT);

    // SigningEventService.append() writes via signingEvent.create
    expect(db.signingEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'OFFER_ACCEPTED' }),
      }),
    );
  });

  it('deletes reminder schedule atomically inside the acceptance transaction', async () => {
    // The deleteMany must execute inside the same $transaction as the CAS and
    // AcceptanceRecord creation so the reminder sweep sees a consistent state:
    // offer.status = ACCEPTED iff the schedule row is gone.
    const { service, db } = await buildService(createMockDb());

    await service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT);

    expect(db.reminderSchedule.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { offerId: OFFER_ID } }),
    );
  });
});

// ── Expiry race — CAS fails because expire-offers job fired in the gap ─────────

describe('AcceptanceService.accept() — expiry race condition', () => {
  // Scenario: the offer is SENT at the pre-transaction guard (A), but the
  // expire-offers job transitions it to EXPIRED before the CAS (B) runs.
  // The CAS returns 0 rows; we then read the current offer status and throw.

  function setupRaceDb(offerStatusAfterCas: string) {
    const db = createMockDb();
    // 1st call: pre-transaction guard → offer is still SENT (race not yet triggered)
    // 2nd call: inside the transaction, after CAS returns 0 → offer is now in final state
    db.offer.findUniqueOrThrow
      .mockResolvedValueOnce(makeOffer())  // pre-tx: SENT
      .mockResolvedValueOnce(makeOffer({ status: offerStatusAfterCas }));  // post-CAS
    // CAS: 0 rows affected — another process (expire job) already changed the status
    db.offer.updateMany.mockResolvedValueOnce({ count: 0 });
    return db;
  }

  it('throws OfferExpiredError when offer transitioned to EXPIRED between guard and CAS', async () => {
    const db = setupRaceDb('EXPIRED');
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferExpiredError);
  });

  it('throws OfferExpiredError specifically — not a generic or wrong domain error', async () => {
    const db = setupRaceDb('EXPIRED');
    const { service } = await buildService(db);

    const err = await service
      .accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OfferExpiredError);
    expect(err).not.toBeInstanceOf(OfferAlreadyAcceptedError);
    expect(err).not.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('does NOT create an AcceptanceRecord when CAS fails due to expiry', async () => {
    const db = setupRaceDb('EXPIRED');
    const { service } = await buildService(db);

    await service
      .accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT)
      .catch(() => {/* expected */});

    // The record must never be created — the transaction rolled back before reaching it.
    expect(db.acceptanceRecord.create).not.toHaveBeenCalled();
  });

  it('does NOT append a signing event when CAS fails due to expiry', async () => {
    const db = setupRaceDb('EXPIRED');
    const { service } = await buildService(db);

    await service
      .accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT)
      .catch(() => {/* expected */});

    // No OFFER_ACCEPTED event should be written — the acceptance was never committed.
    expect(db.signingEvent.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'OFFER_ACCEPTED' }),
      }),
    );
  });

  it('does NOT transition session or recipient when CAS fails', async () => {
    const db = setupRaceDb('EXPIRED');
    const { service } = await buildService(db);

    await service
      .accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT)
      .catch(() => {/* expected */});

    expect(db.signingSession.update).not.toHaveBeenCalled();
    expect(db.offerRecipient.update).not.toHaveBeenCalled();
  });

  it('throws OfferAlreadyAcceptedError when another accept() committed first (CAS race on ACCEPTED)', async () => {
    // Different race: two concurrent accept() calls — one wins, one sees ACCEPTED.
    const db = setupRaceDb('ACCEPTED');
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferAlreadyAcceptedError);
  });

  it('throws InvalidStateTransitionError when offer is REVOKED at CAS time', async () => {
    // Edge case: admin revokes the offer concurrently.
    const db = setupRaceDb('REVOKED');
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(InvalidStateTransitionError);
  });
});

// ── Pre-transaction guards (fast-fail before CAS) ─────────────────────────────
//
// These are NOT the race condition — they verify that the pre-transaction checks
// work correctly when the offer is already in a terminal state before we start.

describe('AcceptanceService.accept() — pre-transaction guards', () => {
  it('throws OfferExpiredError immediately when offer.status is already EXPIRED', async () => {
    const db = createMockDb();
    db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer({ status: 'EXPIRED' }) as never);
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferExpiredError);

    // CAS and record creation were never reached
    expect(db.offer.updateMany).not.toHaveBeenCalled();
    expect(db.acceptanceRecord.create).not.toHaveBeenCalled();
  });

  it('throws OfferExpiredError when offer.expiresAt is in the past (clock expiry)', async () => {
    const db = createMockDb();
    db.offer.findUniqueOrThrow.mockResolvedValue(
      makeOffer({ status: 'SENT', expiresAt: new Date(Date.now() - 1000) }) as never,
    );
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferExpiredError);

    expect(db.offer.updateMany).not.toHaveBeenCalled();
    expect(db.acceptanceRecord.create).not.toHaveBeenCalled();
  });

  it('throws OfferAlreadyAcceptedError immediately when offer.status is already ACCEPTED', async () => {
    const db = createMockDb();
    db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer({ status: 'ACCEPTED' }) as never);
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferAlreadyAcceptedError);

    expect(db.offer.updateMany).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge status is not VERIFIED', async () => {
    const db = createMockDb();
    db.signingOtpChallenge.findUnique.mockResolvedValue({
      ...makeChallenge(),
      status: 'PENDING',
    } as never);
    const { service } = await buildService(db);

    const { OtpChallengeMismatchError } = await import('../../src/common/errors/domain.errors');

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OtpChallengeMismatchError);
  });
});

// ── DB unique constraint — last-resort safety net ─────────────────────────────
//
// The snapshotId column has a UNIQUE constraint (migration 20260326_acceptance_record_unique_snapshot).
// Under normal operation the CAS on Offer.status is sufficient to prevent duplicate
// AcceptanceRecords. These tests verify behaviour if the DB constraint fires anyway —
// e.g., a bug bypassed the CAS, or two requests slipped through under extreme timing.

function makeP2002(targetFields: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.x',
    meta: { target: targetFields },
  });
}

describe('AcceptanceService.accept() — DB unique constraint (P2002)', () => {
  it('throws OfferAlreadyAcceptedError when DB rejects the INSERT with P2002 on snapshotId', async () => {
    // Scenario: CAS passes (count=1), but the snapshotId UNIQUE fires on INSERT.
    // This is the DB acting as the last safety net.
    const db = createMockDb();
    db.acceptanceRecord.create.mockRejectedValueOnce(makeP2002(['snapshotId']) as never);
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferAlreadyAcceptedError);
  });

  it('does not create a signing event when the P2002 fires (transaction rolled back)', async () => {
    const db = createMockDb();
    db.acceptanceRecord.create.mockRejectedValueOnce(makeP2002(['snapshotId']) as never);
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferAlreadyAcceptedError);

    // OFFER_ACCEPTED event must NOT be written — the transaction rolled back.
    expect(db.signingEvent.create).not.toHaveBeenCalled();
  });

  it('also throws OfferAlreadyAcceptedError on P2002 for sessionId — session already committed acceptance', async () => {
    // AcceptanceRecord has two unique constraints: sessionId and snapshotId.
    // A P2002 on sessionId means this signing session was already used to create an
    // AcceptanceRecord — the offer is already accepted from this session's perspective.
    const db = createMockDb();
    db.acceptanceRecord.create.mockRejectedValueOnce(makeP2002(['sessionId']) as never);
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow(OfferAlreadyAcceptedError);
  });

  it('re-throws non-P2002 DB errors unchanged', async () => {
    const db = createMockDb();
    const dbError = new Error('Connection lost');
    db.acceptanceRecord.create.mockRejectedValueOnce(dbError as never);
    const { service } = await buildService(db);

    await expect(
      service.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT),
    ).rejects.toThrow('Connection lost');

    // Must not be classified as a domain error
    await expect(
      (async () => {
        const db2 = createMockDb();
        db2.acceptanceRecord.create.mockRejectedValueOnce(dbError as never);
        const { service: s2 } = await buildService(db2);
        await s2.accept(makeSession() as never, CHALLENGE_ID, DEFAULT_CONTEXT);
      })()
    ).rejects.not.toThrow(OfferAlreadyAcceptedError);
  });
});
