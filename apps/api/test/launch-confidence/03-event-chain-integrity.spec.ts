/**
 * TEST 3 — Signing Event Chain Integrity
 *
 * Invariant: Every event in a signing session forms a cryptographically-linked
 * chain. Each event's hash commits to its predecessor.
 *
 * Strategy:
 *   - Build a complete, valid 4-event chain (SESSION_STARTED → OTP_ISSUED →
 *     OTP_VERIFIED → OFFER_ACCEPTED) by computing hashes with the real
 *     computeEventHash function.
 *   - Run verifyChain() against the mock DB populated with those events.
 *   - Assert the chain is valid.
 *   - Tamper with one event's hash → assert verifyChain() detects the break.
 *   - Break the previousEventHash linkage → assert detection.
 *   - Verify sequenceNumber is strictly monotonic.
 */

import * as crypto from 'crypto';
import { computeEventHash } from '../../src/modules/signing/domain/signing-event.builder';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { jest } from '@jest/globals';

type EventType =
  | 'SESSION_STARTED'
  | 'OTP_ISSUED'
  | 'OTP_VERIFIED'
  | 'OFFER_ACCEPTED';

interface ChainEvent {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  eventType: EventType;
  payload: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  previousEventHash: string | null;
  eventHash: string;
  timestamp: Date;
}

function buildChain(sessionId: string): ChainEvent[] {
  const events: ChainEvent[] = [];
  const types: Array<{ type: EventType; payload: Record<string, unknown> | null }> = [
    { type: 'SESSION_STARTED', payload: { tokenHash: 'abc123' } },
    { type: 'OTP_ISSUED',      payload: { channel: 'EMAIL', deliveryAddress: 'jane@example.com' } },
    { type: 'OTP_VERIFIED',    payload: { challengeId: 'challenge-1', channel: 'EMAIL' } },
    { type: 'OFFER_ACCEPTED',  payload: { acceptanceRecordId: 'record-1', verifiedEmail: 'jane@example.com' } },
  ];

  for (let i = 0; i < types.length; i++) {
    const { type, payload } = types[i];
    const previousEventHash = i === 0 ? null : events[i - 1].eventHash;
    const timestamp = new Date(Date.now() + i * 1000);
    const eventHash = computeEventHash({
      sessionId,
      sequenceNumber: i + 1,
      eventType: type as Parameters<typeof computeEventHash>[0]['eventType'],
      payload,
      timestamp,
      previousEventHash,
    });

    events.push({
      id: `event-${i + 1}`,
      sessionId,
      sequenceNumber: i + 1,
      eventType: type,
      payload,
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      previousEventHash,
      eventHash,
      timestamp,
    });
  }

  return events;
}

function makeEventDb(events: ChainEvent[]) {
  return {
    $transaction: jest.fn(),
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    signingEvent: {
      findMany: jest.fn<any>().mockResolvedValue(events),
      findFirst: jest.fn<any>().mockResolvedValue(events[events.length - 1] ?? null),
      create: jest.fn<any>().mockResolvedValue({ id: 'new-event', sequenceNumber: events.length + 1 }),
    },
  };
}

describe('TEST 3 — Signing Event Chain Integrity', () => {
  const SESSION_ID = 'session-chain-test';

  it('validates a correctly built 4-event chain', async () => {
    const chain = buildChain(SESSION_ID);
    const db = makeEventDb(chain);
    const svc = new SigningEventService(db as never);

    const result = await svc.verifyChain(SESSION_ID);

    expect(result.valid).toBe(true);
    expect(result.brokenAtSequence).toBeUndefined();
  });

  it('detects a tampered eventHash at sequence 3', async () => {
    const chain = buildChain(SESSION_ID);

    // Tamper: replace event #3's hash with garbage
    const tampered = chain.map((e, i) =>
      i === 2 ? { ...e, eventHash: 'deadbeef'.repeat(8) } : e,
    );

    const db = makeEventDb(tampered);
    const svc = new SigningEventService(db as never);

    const result = await svc.verifyChain(SESSION_ID);

    expect(result.valid).toBe(false);
    // Detection occurs at the tampered event itself (seq 3) or the next (seq 4)
    // because seq 4's previousEventHash no longer matches seq 3's eventHash
    expect(result.brokenAtSequence).toBeGreaterThanOrEqual(3);
  });

  it('detects a broken previousEventHash linkage at sequence 2', async () => {
    const chain = buildChain(SESSION_ID);

    // Break: event #2's previousEventHash points to garbage instead of event #1's hash
    const broken = chain.map((e, i) =>
      i === 1 ? { ...e, previousEventHash: 'aaaa'.repeat(16) } : e,
    );

    const db = makeEventDb(broken);
    const svc = new SigningEventService(db as never);

    const result = await svc.verifyChain(SESSION_ID);

    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(2);
  });

  it('detects an inserted event with a duplicated sequenceNumber', async () => {
    const chain = buildChain(SESSION_ID);

    // Insert a rogue event with sequenceNumber: 2 (duplicate)
    const rogueTimestamp = new Date(Date.now() + 1500);
    const rogueHash = computeEventHash({
      sessionId: SESSION_ID,
      sequenceNumber: 2,
      eventType: 'OTP_ISSUED' as Parameters<typeof computeEventHash>[0]['eventType'],
      payload: { injected: true },
      timestamp: rogueTimestamp,
      previousEventHash: chain[0].eventHash,
    });

    const withRogue = [
      chain[0],
      { ...chain[1], id: 'rogue', payload: { injected: true }, eventHash: rogueHash },
      ...chain.slice(1),
    ];

    const db = makeEventDb(withRogue);
    const svc = new SigningEventService(db as never);

    // Chain breaks because the real event #2's previousEventHash no longer
    // points to what verifyChain sees as the prior event in the sequence.
    const result = await svc.verifyChain(SESSION_ID);
    expect(result.valid).toBe(false);
  });

  it('verifies sequenceNumbers are strictly monotonic (1, 2, 3, 4)', () => {
    const chain = buildChain(SESSION_ID);
    for (let i = 0; i < chain.length; i++) {
      expect(chain[i].sequenceNumber).toBe(i + 1);
    }
  });

  it('recomputes matching hashes for all events in the chain', () => {
    const chain = buildChain(SESSION_ID);

    for (const event of chain) {
      const recomputed = computeEventHash({
        sessionId: event.sessionId,
        sequenceNumber: event.sequenceNumber,
        eventType: event.eventType as Parameters<typeof computeEventHash>[0]['eventType'],
        payload: event.payload,
        timestamp: event.timestamp,
        previousEventHash: event.previousEventHash,
      });
      expect(recomputed).toBe(event.eventHash);
    }
  });

  it('GENESIS sentinel is used for the first event, not null', () => {
    const chain = buildChain(SESSION_ID);

    // Compute what hash #1 would be with null (wrong) vs "GENESIS" (correct)
    const withNull = crypto
      .createHash('sha256')
      .update(
        [SESSION_ID, '1', 'SESSION_STARTED', JSON.stringify({ tokenHash: 'abc123' }), chain[0].timestamp.toISOString(), 'null'].join('|'),
        'utf8',
      )
      .digest('hex');

    // The actual hash should NOT match the null-based computation
    expect(chain[0].eventHash).not.toBe(withNull);

    // It should match the GENESIS-sentinel computation (verified by computeEventHash)
    const withGenesis = computeEventHash({
      sessionId: SESSION_ID,
      sequenceNumber: 1,
      eventType: 'SESSION_STARTED' as Parameters<typeof computeEventHash>[0]['eventType'],
      payload: { tokenHash: 'abc123' },
      timestamp: chain[0].timestamp,
      previousEventHash: null,
    });
    expect(chain[0].eventHash).toBe(withGenesis);
  });
});
