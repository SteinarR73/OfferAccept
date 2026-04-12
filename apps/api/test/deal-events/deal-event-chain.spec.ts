import { jest } from '@jest/globals';
import { DealEventService, computeDealEventHash } from '../../src/modules/deal-events/deal-events.service';

// ─── DealEvent hash chain tests (Phase 4 / MEDIUM-4) ─────────────────────────
//
// Tests cover:
//   1. computeDealEventHash is deterministic and sensitive to each field
//   2. emit() stores correct sequenceNumber, previousEventHash, eventHash
//   3. verifyChain() returns valid=true for an intact chain
//   4. verifyChain() detects inserted / deleted / mutated events
//   5. Legacy events (null sequenceNumber) are treated as pre-chain boundary
//
// All tests use an in-memory mock DB — no real Postgres required.

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEAL_ID = 'deal-chain-test-1';

/** Build a mock DealEvent row from partial input. */
function makeEvent(
  seq: number,
  eventType: string,
  prevHash: string | null,
  metadata: Record<string, unknown> | null = null,
  createdAt?: Date,
) {
  const at = createdAt ?? new Date(`2026-04-12T10:00:0${seq}.000Z`);
  const eventHash = computeDealEventHash({
    dealId: DEAL_ID,
    sequenceNumber: seq,
    eventType,
    metadata,
    createdAt: at,
    previousEventHash: prevHash,
  });
  return {
    id: `evt-${seq}`,
    dealId: DEAL_ID,
    eventType,
    metadata,
    createdAt: at,
    sequenceNumber: seq,
    previousEventHash: prevHash,
    eventHash,
  };
}

/** Build a mock DB that returns `events` for dealEvent.findMany. */
function makeDb(events: ReturnType<typeof makeEvent>[]) {
  let created: ReturnType<typeof makeEvent>[] = [...events];
  return {
    $transaction: jest.fn<any>().mockImplementation(
      async (cb: (tx: any) => Promise<unknown>) => cb({
        $queryRaw: jest.fn<any>().mockResolvedValue([]),
        dealEvent: {
          findFirst: jest.fn<any>().mockImplementation(({ orderBy }: any) => {
            const chained = created.filter((e) => e.sequenceNumber !== null);
            if (chained.length === 0) return Promise.resolve(null);
            return Promise.resolve(
              [...chained].sort((a, b) =>
                orderBy?.sequenceNumber === 'desc'
                  ? b.sequenceNumber! - a.sequenceNumber!
                  : a.sequenceNumber! - b.sequenceNumber!,
              )[0],
            );
          }),
          create: jest.fn<any>().mockImplementation(({ data }: { data: any }) => {
            const row = { ...data, id: `evt-${data.sequenceNumber}` };
            created.push(row);
            return Promise.resolve(row);
          }),
        },
      }),
    ),
    dealEvent: {
      findMany: jest.fn<any>().mockImplementation(() => Promise.resolve(created)),
    },
  };
}

// ─── computeDealEventHash ─────────────────────────────────────────────────────

describe('computeDealEventHash', () => {
  const BASE = {
    dealId: DEAL_ID,
    sequenceNumber: 1,
    eventType: 'deal_sent',
    metadata: null,
    createdAt: new Date('2026-04-12T10:00:00.000Z'),
    previousEventHash: null,
  };

  it('is deterministic — same input always produces the same hash', () => {
    expect(computeDealEventHash(BASE)).toBe(computeDealEventHash(BASE));
  });

  it('produces a 64-char hex SHA-256 hash', () => {
    expect(computeDealEventHash(BASE)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when dealId changes', () => {
    expect(computeDealEventHash({ ...BASE, dealId: 'other' })).not.toBe(computeDealEventHash(BASE));
  });

  it('changes when sequenceNumber changes', () => {
    expect(computeDealEventHash({ ...BASE, sequenceNumber: 2 })).not.toBe(computeDealEventHash(BASE));
  });

  it('changes when eventType changes', () => {
    expect(computeDealEventHash({ ...BASE, eventType: 'deal_accepted' })).not.toBe(computeDealEventHash(BASE));
  });

  it('changes when metadata changes', () => {
    expect(computeDealEventHash({ ...BASE, metadata: { key: 'val' } })).not.toBe(computeDealEventHash(BASE));
  });

  it('changes when createdAt changes', () => {
    const altered = new Date(BASE.createdAt.getTime() + 1000);
    expect(computeDealEventHash({ ...BASE, createdAt: altered })).not.toBe(computeDealEventHash(BASE));
  });

  it('changes when previousEventHash changes', () => {
    const withPrev = { ...BASE, previousEventHash: 'prev' + '0'.repeat(60) };
    expect(computeDealEventHash(withPrev)).not.toBe(computeDealEventHash(BASE));
  });
});

// ─── DealEventService.emit() ──────────────────────────────────────────────────

describe('DealEventService.emit()', () => {
  it('writes sequenceNumber=1 and previousEventHash=null for the first event', async () => {
    const db = makeDb([]);
    const svc = new DealEventService(db as never);

    await svc.emit(DEAL_ID, 'deal_created');

    const txMock = await (db.$transaction as jest.Mock<any>).mock.calls[0][0];
    void txMock; // satisfy TS

    // Check via findMany that a row was created
    const rows = await db.dealEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].sequenceNumber).toBe(1);
    expect(rows[0].previousEventHash).toBeNull();
    expect(rows[0].eventHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('writes sequenceNumber=2 and links previousEventHash to prior event', async () => {
    const first = makeEvent(1, 'deal_created', null);
    const db = makeDb([first]);
    const svc = new DealEventService(db as never);

    await svc.emit(DEAL_ID, 'deal_sent');

    const rows = await db.dealEvent.findMany();
    const second = rows.find((r: any) => r.sequenceNumber === 2)!;
    expect(second.previousEventHash).toBe(first.eventHash);
    expect(second.eventHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('eventHash is correct — matches computeDealEventHash with stored fields', async () => {
    const db = makeDb([]);
    const svc = new DealEventService(db as never);
    await svc.emit(DEAL_ID, 'deal_created', { foo: 'bar' });

    const rows = await db.dealEvent.findMany();
    const row = rows[0];
    const expected = computeDealEventHash({
      dealId: row.dealId,
      sequenceNumber: row.sequenceNumber!,
      eventType: row.eventType,
      metadata: row.metadata as Record<string, unknown> | null,
      createdAt: row.createdAt,
      previousEventHash: row.previousEventHash,
    });
    expect(row.eventHash).toBe(expected);
  });
});

// ─── DealEventService.verifyChain() ───────────────────────────────────────────

describe('DealEventService.verifyChain()', () => {
  it('returns valid=true for an empty event list', async () => {
    const svc = new DealEventService(makeDb([]) as never);
    expect(await svc.verifyChain(DEAL_ID)).toEqual({ valid: true });
  });

  it('returns valid=true when all chained events are intact', async () => {
    const e1 = makeEvent(1, 'deal_created', null);
    const e2 = makeEvent(2, 'deal_sent',    e1.eventHash);
    const e3 = makeEvent(3, 'deal_accepted', e2.eventHash);
    const svc = new DealEventService(makeDb([e1, e2, e3]) as never);
    expect(await svc.verifyChain(DEAL_ID)).toEqual({ valid: true });
  });

  it('returns valid=true when only legacy events exist (all sequenceNumber=null)', async () => {
    const legacy = { ...makeEvent(1, 'deal_created', null), sequenceNumber: null, eventHash: null, previousEventHash: null };
    const svc = new DealEventService(makeDb([legacy as any]) as never);
    expect(await svc.verifyChain(DEAL_ID)).toEqual({ valid: true });
  });

  it('returns valid=true when legacy events precede chained events (pre-chain boundary)', async () => {
    const legacy = { ...makeEvent(0, 'deal_created', null), sequenceNumber: null, eventHash: null, previousEventHash: null };
    const e1 = makeEvent(1, 'deal_sent', null); // chain starts fresh after legacy
    const svc = new DealEventService(makeDb([legacy as any, e1]) as never);
    expect(await svc.verifyChain(DEAL_ID)).toEqual({ valid: true });
  });

  it('detects an event with a mutated eventType (hash mismatch)', async () => {
    const e1 = makeEvent(1, 'deal_created', null);
    const e2 = makeEvent(2, 'deal_sent',    e1.eventHash);
    // Mutate the eventType of e2 without updating its hash
    const mutated = { ...e2, eventType: 'deal_revoked' };
    const svc = new DealEventService(makeDb([e1, mutated]) as never);
    const result = await svc.verifyChain(DEAL_ID);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(2);
  });

  it('detects a reordered previousEventHash link', async () => {
    const e1 = makeEvent(1, 'deal_created', null);
    const e2 = makeEvent(2, 'deal_sent',    e1.eventHash);
    // Break the link: make e2.previousEventHash point to wrong hash
    const broken = { ...e2, previousEventHash: 'wrong' + '0'.repeat(59) };
    const svc = new DealEventService(makeDb([e1, broken]) as never);
    const result = await svc.verifyChain(DEAL_ID);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(2);
  });

  it('detects a deleted event (gap in sequence → e3.previousEventHash does not match e1.eventHash)', async () => {
    const e1 = makeEvent(1, 'deal_created', null);
    const e2 = makeEvent(2, 'deal_sent',    e1.eventHash);
    const e3 = makeEvent(3, 'deal_accepted', e2.eventHash);
    // Remove e2 from the list — e3's previousEventHash no longer matches e1
    const svc = new DealEventService(makeDb([e1, e3]) as never);
    const result = await svc.verifyChain(DEAL_ID);
    expect(result.valid).toBe(false);
    // e3's previousEventHash points to e2's hash, but we see e1 before it
    expect(result.brokenAtSequence).toBe(3);
  });
});
