/**
 * TEST 1 — Signing Race Condition
 *
 * Invariant: An offer can only be ACCEPTED once, even under a concurrent storm
 * of 50 simultaneous acceptance attempts.
 *
 * Strategy:
 *   - The mock DB implements the CAS (compare-and-swap) correctly:
 *     offer.updateMany WHERE status='SENT' returns { count: 1 } exactly once,
 *     and { count: 0 } for all subsequent calls.
 *   - acceptanceRecord.create is only called after a successful CAS.
 *   - Promise.all with 50 concurrent calls produces exactly 1 success
 *     and 49 OfferAlreadyAcceptedError rejections.
 *
 * Verification:
 *   - state.acceptanceRecordCount === 1
 *   - successCount === 1
 *   - alreadyAcceptedCount === 49
 */

import { AcceptanceService } from '../../src/modules/signing/services/acceptance.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { OfferAlreadyAcceptedError } from '../../src/common/errors/domain.errors';
import { createRaceDb, makeRaceState } from './helpers/db.factory';

const CONCURRENCY = 50;

function makeVerifiedSession(overrides = {}) {
  return {
    id: 'session-1',
    recipientId: 'recipient-1',
    offerId: 'offer-1',
    snapshotId: 'snapshot-1',
    status: 'OTP_VERIFIED' as const,
    version: 1,
    expiresAt: new Date(Date.now() + 14_400_000),
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    otpVerifiedAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TEST 1 — Signing Race Condition', () => {
  it('allows exactly one acceptance from 50 concurrent requests', async () => {
    const state = makeRaceState();
    const db = createRaceDb(state) as unknown as ConstructorParameters<typeof AcceptanceService>[0];

    // Build SigningEventService with the same mock DB
    const eventService = new SigningEventService(db as never);
    const svc = new AcceptanceService(db as never, eventService);

    const session = makeVerifiedSession();
    const ctx = { ipAddress: '127.0.0.1', userAgent: 'jest/launch-confidence' };

    // Launch 50 concurrent acceptance attempts
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () =>
        svc.accept(session, 'challenge-1', ctx),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const alreadyAccepted = results.filter(
      (r) =>
        r.status === 'rejected' &&
        (r as PromiseRejectedResult).reason instanceof OfferAlreadyAcceptedError,
    );
    const otherErrors = results.filter(
      (r) =>
        r.status === 'rejected' &&
        !((r as PromiseRejectedResult).reason instanceof OfferAlreadyAcceptedError),
    );

    // ── Invariant assertions ──────────────────────────────────────────────────
    expect(otherErrors).toHaveLength(0);
    expect(successes).toHaveLength(1);
    expect(alreadyAccepted).toHaveLength(CONCURRENCY - 1);

    // Exactly ONE AcceptanceRecord was created
    expect(state.acceptanceRecordCount).toBe(1);

    // The offer transitioned to ACCEPTED exactly once
    expect(state.offerStatus).toBe('ACCEPTED');
  });

  it('produces OfferAlreadyAcceptedError (not a 500) when CAS loses immediately', async () => {
    // Simulate: offer already accepted before the storm begins
    const state = makeRaceState({ offerStatus: 'ACCEPTED' });
    const db = createRaceDb(state) as unknown as ConstructorParameters<typeof AcceptanceService>[0];

    // The pre-transaction guard (offer.status !== 'SENT') fires before any CAS
    const eventService = new SigningEventService(db as never);
    const svc = new AcceptanceService(db as never, eventService);

    await expect(
      svc.accept(makeVerifiedSession(), 'challenge-1', {}),
    ).rejects.toBeInstanceOf(OfferAlreadyAcceptedError);

    // No AcceptanceRecord was created
    expect(state.acceptanceRecordCount).toBe(0);
  });

  it('guarantee: AcceptanceRecord is created only after a successful CAS', async () => {
    const state = makeRaceState();
    const db = createRaceDb(state) as unknown as ConstructorParameters<typeof AcceptanceService>[0];
    const eventService = new SigningEventService(db as never);
    const svc = new AcceptanceService(db as never, eventService);

    // First call succeeds
    await svc.accept(makeVerifiedSession(), 'challenge-1', {});
    expect(state.acceptanceRecordCount).toBe(1);

    // Second call — CAS returns { count: 0 } — should throw, not create a second record
    await expect(
      svc.accept(makeVerifiedSession(), 'challenge-1', {}),
    ).rejects.toBeInstanceOf(OfferAlreadyAcceptedError);

    expect(state.acceptanceRecordCount).toBe(1); // still 1 — no extra record
  });
});
