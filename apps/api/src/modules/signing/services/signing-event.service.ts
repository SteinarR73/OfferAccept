import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, SigningEvent, SigningEventType, Prisma } from '@prisma/client';
import { computeEventHash } from '../domain/signing-event.builder';

// ─── SigningEventService ───────────────────────────────────────────────────────
//
// The only way signing events should be written anywhere in the application.
// Enforces: append-only, sequenced, hash-chained.
//
// Concurrency safety: every append acquires a Postgres advisory transaction lock
// keyed by sessionId before reading the last sequence number. This serializes
// concurrent appends within the same session across any number of processes.
// The lock is automatically released when the enclosing transaction commits or
// rolls back — no manual unlock is needed.
//
// Lock key derivation:
//   pg_advisory_xact_lock(hashtext(sessionId)::bigint)
//
//   hashtext() is Postgres's internal MurmurHash-based function that returns int4
//   (32-bit signed). Casting to bigint widens to 64-bit, but the entropy remains
//   32 bits because hashtext output fills only the lower 32 bits of the bigint.
//
//   Collision risk: two distinct session IDs map to the same advisory lock key
//   with probability ≈ 1/2^32 (~2.3 × 10⁻¹⁰ per pair). For v1 concurrency
//   correctness this is acceptable — a collision merely serializes two sessions
//   that could have run in parallel; it does NOT corrupt data.
//
//   Migration path to eliminate collision risk (do before scaling past ~100k active
//   sessions):
//     1. Compute SHA-256 of the sessionId string.
//     2. Take the first 8 bytes of the digest and interpret as a signed int64.
//     3. Pass that value to pg_advisory_xact_lock() directly.
//   This gives 64 bits of entropy and reduces collision probability to ≈ 1/2^64.
//   Implementation requires a native SHA library or a Postgres UDF; Prisma $queryRaw
//   can call the UDF as:  SELECT pg_advisory_xact_lock(sha256_to_int64(${sessionId}))

export interface AppendEventInput {
  sessionId: string;
  eventType: SigningEventType;
  payload?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SigningEventService {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // Appends a new event to the chain for the given session.
  // Returns the created event.
  async append(input: AppendEventInput): Promise<SigningEvent>;

  // Overload: accepts an active transaction client to participate in a larger transaction.
  async append(
    input: AppendEventInput,
    tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  ): Promise<SigningEvent>;

  async append(
    input: AppendEventInput,
    tx?: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  ): Promise<SigningEvent> {
    if (tx) {
      return this.appendWithLock(input, tx);
    }
    // No caller-supplied transaction: wrap in our own so the advisory lock is
    // always acquired inside a transaction (required by pg_advisory_xact_lock).
    return this.db.$transaction((innerTx) =>
      this.appendWithLock(
        input,
        innerTx as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
      ),
    );
  }

  private async appendWithLock(
    input: AppendEventInput,
    tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  ): Promise<SigningEvent> {
    // Acquire a session-scoped advisory transaction lock.
    // Blocks until the lock is free; released automatically on transaction end.
    // This serializes concurrent appends to the same session across all processes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sessionId})::bigint)`;

    // Read the last event AFTER acquiring the lock — safe from TOCTOU.
    const lastEvent = await tx.signingEvent.findFirst({
      where: { sessionId: input.sessionId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true, eventHash: true },
    });

    const sequenceNumber = (lastEvent?.sequenceNumber ?? 0) + 1;
    const previousEventHash = lastEvent?.eventHash ?? null;
    const timestamp = new Date();

    const eventHash = computeEventHash({
      sessionId: input.sessionId,
      sequenceNumber,
      eventType: input.eventType,
      payload: input.payload ?? null,
      timestamp,
      previousEventHash,
    });

    return tx.signingEvent.create({
      data: {
        sessionId: input.sessionId,
        sequenceNumber,
        eventType: input.eventType,
        payload: input.payload as Prisma.InputJsonValue ?? Prisma.JsonNull,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        previousEventHash,
        eventHash,
        timestamp,
      },
    });
  }

  // Verifies the entire event chain for a session.
  // Returns true if valid, false if any event fails hash verification.
  // Used for audit and certificate verification — not called in the hot path.
  async verifyChain(sessionId: string): Promise<{ valid: boolean; brokenAtSequence?: number }> {
    const events = await this.db.signingEvent.findMany({
      where: { sessionId },
      orderBy: { sequenceNumber: 'asc' },
    });

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const previousEventHash = i === 0 ? null : events[i - 1].eventHash;

      // Verify previousEventHash linkage
      if (event.previousEventHash !== previousEventHash) {
        return { valid: false, brokenAtSequence: event.sequenceNumber };
      }

      // Recompute and compare hash
      const expectedHash = computeEventHash({
        sessionId: event.sessionId,
        sequenceNumber: event.sequenceNumber,
        eventType: event.eventType,
        payload: (event.payload as Record<string, unknown>) ?? null,
        timestamp: event.timestamp,
        previousEventHash: event.previousEventHash,
      });

      if (expectedHash !== event.eventHash) {
        return { valid: false, brokenAtSequence: event.sequenceNumber };
      }
    }

    return { valid: true };
  }
}
