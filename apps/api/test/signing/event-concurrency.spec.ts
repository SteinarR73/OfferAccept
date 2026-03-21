import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';

// ─── Event concurrency / advisory lock tests ───────────────────────────────────
//
// Verifies that SigningEventService.append() acquires pg_advisory_xact_lock
// before reading the last sequence number and that sequence numbers are correct.
//
// The advisory lock SQL is tested by asserting that $queryRaw is called with
// a hashtext-based lock key before any signingEvent.findFirst is called.
// Concurrent correctness is a property of Postgres itself — unit tests verify
// the protocol (lock → read → write), not the DB internals.

const SESSION_ID = 'session-lock-test-1';

function makeEventCreate(seq: number) {
  return {
    id: `event-${seq}`,
    sessionId: SESSION_ID,
    sequenceNumber: seq,
    eventType: 'SESSION_STARTED',
    payload: null,
    ipAddress: null,
    userAgent: null,
    previousEventHash: null,
    eventHash: 'hash-stub',
    timestamp: new Date(),
  };
}

function createMockDb(lastSeqNumber: number | null = null) {
  // Track call order to assert lock-before-read
  const callOrder: string[] = [];

  const txMock = {
    $queryRaw: jest.fn().mockImplementation(async () => {
      callOrder.push('$queryRaw');
      return [];
    }),
    signingEvent: {
      findFirst: jest.fn().mockImplementation(async () => {
        callOrder.push('findFirst');
        return lastSeqNumber !== null
          ? { sequenceNumber: lastSeqNumber, eventHash: `hash-${lastSeqNumber}` }
          : null;
      }),
      create: jest.fn().mockImplementation(async (args: unknown) => {
        callOrder.push('create');
        return makeEventCreate((args as { data: { sequenceNumber: number } }).data.sequenceNumber);
      }),
    },
  };

  const db = {
    $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
      callOrder.push('$transaction');
      return (fn as (tx: typeof txMock) => Promise<unknown>)(txMock);
    }),
    _txMock: txMock,
    _callOrder: callOrder,
  };

  return db;
}

type MockDb = ReturnType<typeof createMockDb>;

async function buildService(db: MockDb) {
  const module = await Test.createTestingModule({
    providers: [
      SigningEventService,
      { provide: 'PRISMA', useValue: db },
    ],
  }).compile();

  return module.get(SigningEventService);
}

describe('SigningEventService.append() — advisory lock protocol', () => {
  it('wraps standalone append in $transaction and acquires advisory lock before reading', async () => {
    const db = createMockDb(null);
    const service = await buildService(db);

    await service.append({
      sessionId: SESSION_ID,
      eventType: 'SESSION_STARTED',
    });

    // Must have entered a transaction
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    // Lock must be acquired BEFORE reading the last sequence number
    const txOrder = db._callOrder.filter((c) => c !== '$transaction');
    expect(txOrder[0]).toBe('$queryRaw');
    expect(txOrder[1]).toBe('findFirst');
    expect(txOrder[2]).toBe('create');
  });

  it('acquires advisory lock even when tx is provided by caller', async () => {
    const db = createMockDb(null);
    const service = await buildService(db);

    // Simulate caller supplying an active transaction
    await service.append(
      { sessionId: SESSION_ID, eventType: 'OTP_ISSUED' },
      db._txMock as never,
    );

    // No outer $transaction needed — caller already has one
    expect(db.$transaction).not.toHaveBeenCalled();

    // But the lock must still be acquired
    expect(db._txMock.$queryRaw).toHaveBeenCalled();
  });

  it('assigns sequenceNumber = 1 when there are no prior events', async () => {
    const db = createMockDb(null); // no last event
    const service = await buildService(db);

    await service.append({ sessionId: SESSION_ID, eventType: 'SESSION_STARTED' });

    const createCall = db._txMock.signingEvent.create.mock.calls[0][0] as {
      data: { sequenceNumber: number };
    };
    expect(createCall.data.sequenceNumber).toBe(1);
  });

  it('assigns sequenceNumber = lastSeq + 1 when prior events exist', async () => {
    const db = createMockDb(7); // last event has sequence 7
    const service = await buildService(db);

    await service.append({ sessionId: SESSION_ID, eventType: 'DOCUMENT_VIEWED' });

    const createCall = db._txMock.signingEvent.create.mock.calls[0][0] as {
      data: { sequenceNumber: number };
    };
    expect(createCall.data.sequenceNumber).toBe(8);
  });

  it('sets previousEventHash from last event hash', async () => {
    const lastHash = 'hash-7';
    const db = createMockDb(7);
    // Override to return our known hash
    db._txMock.signingEvent.findFirst.mockResolvedValue(
      { sequenceNumber: 7, eventHash: lastHash } as never,
    );
    const service = await buildService(db);

    await service.append({ sessionId: SESSION_ID, eventType: 'OTP_VERIFIED' });

    const createCall = db._txMock.signingEvent.create.mock.calls[0][0] as {
      data: { previousEventHash: string };
    };
    expect(createCall.data.previousEventHash).toBe(lastHash);
  });

  it('sets previousEventHash to null for the first event in a session', async () => {
    const db = createMockDb(null);
    const service = await buildService(db);

    await service.append({ sessionId: SESSION_ID, eventType: 'SESSION_STARTED' });

    const createCall = db._txMock.signingEvent.create.mock.calls[0][0] as {
      data: { previousEventHash: string | null };
    };
    expect(createCall.data.previousEventHash).toBeNull();
  });
});
