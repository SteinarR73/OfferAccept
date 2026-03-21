import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConcurrencyConflictError } from '../../src/common/errors/domain.errors';
import { SigningSessionService } from '../../src/modules/signing/services/signing-session.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';

// ─── Concurrency auto-retry tests ─────────────────────────────────────────────
//
// Verifies that SigningSessionService.transition() auto-retries exactly once
// when the first doTransition() attempt raises ConcurrencyConflictError.
// The retry re-fetches the fresh session via getAndValidate().

const SESSION_ID = 'session-retry-1';
const RECIPIENT_ID = 'recipient-retry-1';
const OFFER_ID = 'offer-retry-1';
const SNAPSHOT_ID = 'snap-retry-1';

function makeSession(version = 3) {
  return {
    id: SESSION_ID,
    recipientId: RECIPIENT_ID,
    offerId: OFFER_ID,
    snapshotId: SNAPSHOT_ID,
    status: 'OTP_VERIFIED' as const,
    version,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    startedAt: new Date(),
    completedAt: null,
    otpVerifiedAt: new Date(),
    ipAddress: null,
    userAgent: null,
    updatedAt: new Date(),
  };
}

// Creates a mock DB where the first updateMany returns count=0 (conflict),
// and the second returns count=1 (success after re-fetch).
function createRetryMockDb() {
  let callCount = 0;
  const txMock = {
    $queryRaw: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
    signingSession: {
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockImplementation(async () => {
        callCount += 1;
        return { count: callCount === 1 ? 0 : 1 };
      }),
      findUniqueOrThrow: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(makeSession(4)),
      findUnique: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(makeSession(4)), // for getAndValidate on retry
      findFirst: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(null),
    },
    signingEvent: {
      findFirst: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(null),
      create: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue({
        id: 'event-1',
        sequenceNumber: 1,
        eventHash: 'h1',
        previousEventHash: null,
        timestamp: new Date(),
      }),
    },
  };

  return {
    $transaction: jest.fn().mockImplementation(async (fn: unknown) => (fn as (tx: typeof txMock) => Promise<unknown>)(txMock)),
    signingSession: {
      findUnique: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(makeSession(4)), // outer getAndValidate call
    },
    _txMock: txMock,
    _callCount: () => callCount,
  };
}

async function buildService(db: ReturnType<typeof createRetryMockDb>) {
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

describe('SigningSessionService.transition() — auto-retry on ConcurrencyConflictError', () => {
  it('succeeds on second attempt when first attempt raises ConcurrencyConflictError', async () => {
    const db = createRetryMockDb();
    const service = await buildService(db);

    const staleSession = makeSession(3);

    // Should NOT throw — first attempt fails (count=0), second succeeds (count=1)
    await expect(
      service.transition(staleSession as never, 'ACCEPTED', {}),
    ).resolves.toBeDefined();

    // updateMany must have been called twice (once per attempt)
    expect(db._txMock.signingSession.updateMany).toHaveBeenCalledTimes(2);
  });

  it('re-fetches the session via getAndValidate before the retry', async () => {
    const db = createRetryMockDb();
    const service = await buildService(db);

    const staleSession = makeSession(3);
    await service.transition(staleSession as never, 'ACCEPTED', {});

    // The outer signingSession.findUnique must have been called for the re-fetch
    expect(db.signingSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SESSION_ID } }),
    );
  });

  it('throws ConcurrencyConflictError when BOTH attempts fail', async () => {
    // Both attempts return count=0
    const txMock = {
      $queryRaw: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
      signingSession: {
        updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(makeSession(4)),
        findUnique: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(makeSession(4)),
        findFirst: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(null),
      },
      signingEvent: {
        findFirst: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(null),
        create: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue({ id: 'e', sequenceNumber: 1, eventHash: 'h', previousEventHash: null, timestamp: new Date() }),
      },
    };

    const db = {
      $transaction: jest.fn().mockImplementation(async (fn: unknown) => (fn as (tx: typeof txMock) => Promise<unknown>)(txMock)),
      signingSession: { findUnique: (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(makeSession(4)) },
      _txMock: txMock,
    };

    const eventServiceMock = { append: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        SigningSessionService,
        { provide: 'PRISMA', useValue: db },
        { provide: SigningEventService, useValue: eventServiceMock },
      ],
    }).compile();

    const service = module.get(SigningSessionService);
    const staleSession = makeSession(3);

    await expect(
      service.transition(staleSession as never, 'ACCEPTED', {}),
    ).rejects.toThrow(ConcurrencyConflictError);

    // Must have tried exactly twice
    expect(txMock.signingSession.updateMany).toHaveBeenCalledTimes(2);
  });
});
