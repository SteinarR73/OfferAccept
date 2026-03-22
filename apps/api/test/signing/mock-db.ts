import { jest } from '@jest/globals';

// ─── Mock Prisma factory ───────────────────────────────────────────────────────
// Creates a fully-typed mock of the PrismaClient methods used by the signing flow.
// `$transaction` executes the callback synchronously with the same mock,
// so transactional code can be tested without a real DB.

export function createMockDb() {
  const mock = {
    $transaction: jest.fn(),
    // pg_advisory_xact_lock is called inside transactions via $queryRaw.
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    offerRecipient: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      // Used by verifyAndAdvanceSession() for optimistic concurrency check.
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    offer: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      // Used by acceptanceService.accept/decline for atomic compare-and-swap.
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
    offerSnapshot: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    offerSnapshotDocument: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    signingSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      // Used by doTransition() for optimistic concurrency — default allows state changes to succeed.
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
    signingEvent: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    signingOtpChallenge: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    acceptanceRecord: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    acceptanceCertificate: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  // Configure $transaction after `mock` is fully initialized to avoid circular
  // type inference (TS7022). The callback receives the same mock as the tx argument.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mock.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: any) => Promise<unknown>)(mock));
  return mock;
}

export type MockDb = ReturnType<typeof createMockDb>;

// ─── Fixture factories ────────────────────────────────────────────────────────
// Produce minimal valid objects that match Prisma model shapes.
// Only fields relevant to the signing flow are included.

import * as crypto from 'crypto';

export const VALID_RAW_TOKEN = 'oa_' + 'a'.repeat(43); // valid format
export const VALID_TOKEN_HASH = crypto
  .createHash('sha256')
  .update(VALID_RAW_TOKEN, 'utf8')
  .digest('hex');

export function makeRecipient(overrides: Partial<ReturnType<typeof _makeRecipient>> = {}) {
  return { ..._makeRecipient(), ...overrides };
}

function _makeRecipient() {
  return {
    id: 'recipient-1',
    offerId: 'offer-1',
    email: 'jane@example.com',
    name: 'Jane Smith',
    tokenHash: VALID_TOKEN_HASH,
    tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    tokenInvalidatedAt: null,
    status: 'PENDING' as const,
    viewedAt: null,
    respondedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    organizationId: 'org-1',
    createdById: 'user-1',
    title: 'Software Development Agreement',
    message: 'Please review and accept this offer.',
    status: 'SENT' as const,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

export function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snapshot-1',
    offerId: 'offer-1',
    title: 'Software Development Agreement',
    message: 'Please review and accept this offer.',
    senderName: 'Acme Corp',
    senderEmail: 'sender@acme.com',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    contentHash: 'abc123' + '0'.repeat(58),
    frozenAt: new Date(),
    documents: [],
    ...overrides,
  };
}

export function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    recipientId: 'recipient-1',
    offerId: 'offer-1',
    snapshotId: 'snapshot-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    status: 'AWAITING_OTP' as const,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    otpVerifiedAt: null,
    startedAt: new Date(),
    completedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeChallenge(overrides: Record<string, unknown> = {}) {
  const rawCode = '123456';
  const codeHash = crypto.createHash('sha256').update(rawCode, 'utf8').digest('hex');
  return {
    id: 'challenge-1',
    sessionId: 'session-1',
    recipientId: 'recipient-1',
    channel: 'EMAIL' as const,
    deliveryAddress: 'jane@example.com',
    codeHash,
    status: 'PENDING' as const,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attemptCount: 0,
    maxAttempts: 5,
    verifiedAt: null,
    invalidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeAcceptanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    recipientId: 'recipient-1',
    snapshotId: 'snapshot-1',
    acceptanceStatement: 'I, Jane Smith, confirm...',
    verifiedEmail: 'jane@example.com',
    emailVerifiedAt: new Date(),
    acceptedAt: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    locale: null,
    timezone: null,
    snapshotContentHash: 'abc123' + '0'.repeat(58),
    createdAt: new Date(),
    ...overrides,
  };
}
