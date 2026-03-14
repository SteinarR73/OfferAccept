import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, SigningEvent, SigningEventType, Prisma } from '@prisma/client';
import { computeEventHash } from '../domain/signing-event.builder';

// ─── SigningEventService ───────────────────────────────────────────────────────
//
// The only way signing events should be written anywhere in the application.
// Enforces: append-only, sequenced, hash-chained.
//
// Concurrency note: for v1 (single recipient, single-threaded signing flow),
// concurrent event inserts into the same session are not expected. The sequence
// number assignment is not atomic across processes. If concurrent signing sessions
// become possible, this must be moved to a serialized queue or a DB sequence with
// a row lock on the session.

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
    const client = tx ?? this.db;

    // Get the last event in this session to determine sequence number and prev hash
    const lastEvent = await client.signingEvent.findFirst({
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

    return client.signingEvent.create({
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
