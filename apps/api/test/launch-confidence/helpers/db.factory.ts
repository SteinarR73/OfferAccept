import { jest } from '@jest/globals';
import * as crypto from 'crypto';

// ─── Stateful mock DB for launch-confidence tests ─────────────────────────────
//
// Unlike the signing mock-db (which uses static defaults), this factory allows
// tests to configure the CAS outcome, challenge state, and other mutable state
// that changes as requests race against each other.

// ─── Race-condition DB ─────────────────────────────────────────────────────────
// The CAS on offer.updateMany allows exactly ONE winner. All subsequent calls
// return { count: 0 }, simulating a fully serialized concurrent accept storm.

export interface RaceState {
  offerStatus: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  acceptanceRecordCount: number;
}

export function createRaceDb(state: RaceState) {
  let casAttempts = 0;

  const mock = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),

    offer: {
      findUniqueOrThrow: jest.fn<any>().mockImplementation(async () => ({
        id: 'offer-1',
        organizationId: 'org-1',
        status: state.offerStatus,
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockImplementation(async () => {
        casAttempts++;
        if (casAttempts === 1 && state.offerStatus === 'SENT') {
          state.offerStatus = 'ACCEPTED';
          return { count: 1 };
        }
        return { count: 0 }; // every subsequent CAS loses
      }),
    },

    offerRecipient: {
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue({
        id: 'recipient-1',
        name: 'Jane Smith',
        email: 'jane@example.com',
        status: 'OTP_VERIFIED',
        version: 1,
      }),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },

    offerSnapshot: {
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue({
        id: 'snapshot-1',
        offerId: 'offer-1',
        title: 'Software Agreement',
        message: null,
        senderName: 'Acme Corp',
        senderEmail: 'sender@acme.com',
        expiresAt: null,
        contentHash: 'a'.repeat(64),
        frozenAt: new Date(),
      }),
    },

    signingOtpChallenge: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: 'challenge-1',
        sessionId: 'session-1',
        recipientId: 'recipient-1',
        status: 'VERIFIED',
        deliveryAddress: 'jane@example.com',
        verifiedAt: new Date(),
        attemptCount: 1,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 600_000),
      }),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },

    acceptanceRecord: {
      create: jest.fn<any>().mockImplementation(async () => {
        state.acceptanceRecordCount++;
        return {
          id: `record-${state.acceptanceRecordCount}`,
          sessionId: 'session-1',
          recipientId: 'recipient-1',
          snapshotId: 'snapshot-1',
          acceptanceStatement: 'I confirm acceptance.',
          verifiedEmail: 'jane@example.com',
          emailVerifiedAt: new Date(),
          acceptedAt: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          locale: null,
          timezone: null,
          snapshotContentHash: 'a'.repeat(64),
          createdAt: new Date(),
        };
      }),
    },

    signingSession: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },

    signingEvent: {
      create: jest.fn<any>().mockResolvedValue({ id: 'event-1', sequenceNumber: 1, eventHash: 'hash' }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },

    reminderSchedule: {
      deleteMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
  };

  mock.$transaction.mockImplementation(
    async (fn: unknown) => (fn as (tx: typeof mock) => Promise<unknown>)(mock),
  );

  return mock;
}

// ─── OTP brute-force DB ────────────────────────────────────────────────────────
// Tracks a single challenge whose attemptCount increments on each failed verify.

export interface OtpState {
  attemptCount: number;
  status: 'PENDING' | 'LOCKED' | 'VERIFIED' | 'EXPIRED' | 'INVALIDATED';
  maxAttempts: number;
  codeHash: string; // SHA-256 of the correct code
}

export function createOtpDb(state: OtpState) {
  const mock = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),

    signingOtpChallenge: {
      findUnique: jest.fn<any>().mockImplementation(async () => ({
        id: 'challenge-1',
        sessionId: 'session-1',
        recipientId: 'recipient-1',
        status: state.status,
        codeHash: state.codeHash,
        attemptCount: state.attemptCount,
        maxAttempts: state.maxAttempts,
        expiresAt: new Date(Date.now() + 600_000),
        verifiedAt: null,
        invalidatedAt: null,
        channel: 'EMAIL',
        deliveryAddress: 'jane@example.com',
      })),
      update: jest.fn<any>().mockImplementation(async (args: { data: { attemptCount?: number; status?: string } }) => {
        if (args.data.attemptCount !== undefined) {
          state.attemptCount = args.data.attemptCount;
        }
        if (args.data.status) {
          state.status = args.data.status as OtpState['status'];
        }
        return {};
      }),
      aggregate: jest.fn<any>().mockResolvedValue({ _sum: { attemptCount: 0 } }),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
    },

    signingSession: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: 'session-1',
        recipientId: 'recipient-1',
        offerId: 'offer-1',
        status: 'AWAITING_OTP',
        version: 1,
        expiresAt: new Date(Date.now() + 14_400_000),
      }),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },

    offerRecipient: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: 'recipient-1', version: 1 }),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },

    signingEvent: {
      create: jest.fn<any>().mockResolvedValue({ id: 'event-1' }),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };

  mock.$transaction.mockImplementation(
    async (fn: unknown) => (fn as (tx: typeof mock) => Promise<unknown>)(mock),
  );

  return mock;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export const CORRECT_OTP_CODE = '482910';
export const WRONG_OTP_CODE = '000000';

export function makeOtpState(overrides: Partial<OtpState> = {}): OtpState {
  const codeHash = crypto.createHash('sha256').update(CORRECT_OTP_CODE, 'utf8').digest('hex');
  return {
    attemptCount: 0,
    status: 'PENDING',
    maxAttempts: 5,
    codeHash,
    ...overrides,
  };
}

export function makeRaceState(overrides: Partial<RaceState> = {}): RaceState {
  return {
    offerStatus: 'SENT',
    acceptanceRecordCount: 0,
    ...overrides,
  };
}

// ─── Reminder-storm DB ────────────────────────────────────────────────────────
// Returns N reminder schedules; tracks how many updates each schedule received.

export interface ReminderCallLog {
  updateCallsPerSchedule: Map<string, number>;
  emailCallsPerSchedule: Map<string, number>;
}

export function createReminderDb(scheduleCount: number, log: ReminderCallLog) {
  const now = new Date();
  const dealSentAt = new Date(now.getTime() - 25 * 3600 * 1000); // 25h ago → R1 due

  const schedules = Array.from({ length: scheduleCount }, (_, i) => ({
    id: `sched-${i}`,
    offerId: `offer-${i}`,
    dealSentAt,
    nextReminderAt: new Date(now.getTime() - 1000), // overdue
    reminderCount: 0,
    warning24hSentAt: null,
    warning2hSentAt: null,
    createdAt: now,
    updatedAt: now,
    offer: {
      id: `offer-${i}`,
      status: 'SENT',
      expiresAt: null,
      recipient: {
        id: `recipient-${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`,
        status: 'PENDING',
      },
      snapshot: {
        title: `Agreement ${i}`,
        senderName: 'Acme Corp',
        expiresAt: null,
      },
    },
  }));

  // Hoisted so the $transaction mock can share the same logging implementation.
  const scheduleUpdate = jest.fn<any>().mockImplementation(async (args: { where: { id: string } }) => {
    const id = args.where.id;
    log.updateCallsPerSchedule.set(id, (log.updateCallsPerSchedule.get(id) ?? 0) + 1);
    return {};
  });
  const scheduleDelete = jest.fn<any>().mockResolvedValue({});

  return {
    $transaction: jest.fn<any>().mockImplementation(async (fn: unknown) => {
      const mockTx = {
        offer: { findUnique: jest.fn<any>().mockResolvedValue({ status: 'SENT' }) },
        reminderSchedule: { update: scheduleUpdate, delete: scheduleDelete },
        offerRecipient: { update: jest.fn<any>().mockResolvedValue({}) },
      };
      return (fn as (tx: unknown) => Promise<unknown>)(mockTx);
    }),
    reminderSchedule: {
      findMany: jest.fn<any>().mockResolvedValue(schedules),
      update: scheduleUpdate,
      delete: scheduleDelete,
      deleteMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
    },
    offerRecipient: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
  };
}
