import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConcurrencyConflictError } from '../../src/common/errors/domain.errors';
import { SigningSessionService } from '../../src/modules/signing/services/signing-session.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';

// ─── Optimistic concurrency tests ─────────────────────────────────────────────
//
// Verifies that SigningSessionService.transition() uses a version check in its
// update WHERE clause and throws ConcurrencyConflictError when the version
// does not match (simulating a concurrent update from another process).

const SESSION_ID = 'session-concurrency-1';
const RECIPIENT_ID = 'recipient-concurrency-1';
const OFFER_ID = 'offer-concurrency-1';
const SNAPSHOT_ID = 'snap-concurrency-1';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    recipientId: RECIPIENT_ID,
    offerId: OFFER_ID,
    snapshotId: SNAPSHOT_ID,
    status: 'OTP_VERIFIED',
    version: 3,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    startedAt: new Date(),
    completedAt: null,
    otpVerifiedAt: new Date(),
    ipAddress: null,
    userAgent: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockDb(updateCount: number = 1) {
  const txMock = {
    $queryRaw: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
    signingSession: {
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: updateCount }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(makeSession()),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'event-1', sequenceNumber: 1, eventHash: 'h1', previousEventHash: null }),
    },
    signingEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'event-1', sequenceNumber: 1, eventHash: 'h1', previousEventHash: null, timestamp: new Date() }),
    },
  };

  return {
    $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
    _txMock: txMock,
  };
}

type MockDb = ReturnType<typeof createMockDb>;

async function buildService(db: MockDb) {
  const eventServiceMock = {
    append: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const module = await Test.createTestingModule({
    providers: [
      SigningSessionService,
      { provide: 'PRISMA', useValue: db },
      { provide: SigningEventService, useValue: eventServiceMock },
    ],
  }).compile();

  return module.get(SigningSessionService);
}

describe('SigningSessionService.transition() — optimistic concurrency', () => {
  it('includes session version in updateMany WHERE clause', async () => {
    const db = createMockDb(1); // count = 1 → success
    const service = await buildService(db);

    const session = makeSession({ version: 3 });
    await service.transition(session as never, 'ACCEPTED', {});

    const call = db._txMock.signingSession.updateMany.mock.calls[0][0] as {
      where: { id: string; version: number };
      data: { version: { increment: number } };
    };
    expect(call.where.id).toBe(SESSION_ID);
    expect(call.where.version).toBe(3); // must match current version
    expect(call.data.version).toEqual({ increment: 1 }); // must increment
  });

  it('throws ConcurrencyConflictError when updateMany returns count = 0', async () => {
    const db = createMockDb(0); // count = 0 → concurrent modification detected
    const service = await buildService(db);

    const session = makeSession({ version: 3 });

    await expect(
      service.transition(session as never, 'ACCEPTED', {}),
    ).rejects.toThrow(ConcurrencyConflictError);
  });

  it('does NOT throw when updateMany returns count = 1', async () => {
    const db = createMockDb(1);
    const service = await buildService(db);

    const session = makeSession({ version: 5 });

    await expect(
      service.transition(session as never, 'ACCEPTED', {}),
    ).resolves.toBeDefined();
  });

  it('ConcurrencyConflictError has correct entity name', async () => {
    const db = createMockDb(0);
    const service = await buildService(db);

    const session = makeSession({ version: 1 });

    const err = await service.transition(session as never, 'DECLINED', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ConcurrencyConflictError);
    expect(err.message).toContain('SigningSession');
  });
});
