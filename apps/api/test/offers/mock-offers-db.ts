import { jest } from '@jest/globals';

// ─── Mock Prisma factory for offers tests ─────────────────────────────────────

export function createMockOffersDb() {
  const mock = {
    $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mock) => Promise<unknown>) =>
      fn(mock),
    ),
    user: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    offer: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    offerDocument: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    offerRecipient: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    offerSnapshot: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    offerSnapshotDocument: {
      create: jest.fn(),
    },
    offerDeliveryAttempt: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return mock;
}

export type MockOffersDb = ReturnType<typeof createMockOffersDb>;

// ─── Fixture factories ────────────────────────────────────────────────────────

export const ORG_ID = 'org-1';
export const USER_ID = 'user-1';

export function makeDraftOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    organizationId: ORG_ID,
    createdById: USER_ID,
    title: 'Website Redesign Proposal',
    message: 'Please review this proposal.',
    status: 'DRAFT' as const,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    recipient: null,
    documents: [],
    ...overrides,
  };
}

export function makeSentOffer(overrides: Record<string, unknown> = {}) {
  return {
    ...makeDraftOffer(),
    status: 'SENT' as const,
    recipient: makeRecipient(),
    ...overrides,
  };
}

export function makeRecipient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'recipient-1',
    offerId: 'offer-1',
    email: 'client@acme.com',
    name: 'Alice Client',
    tokenHash: 'draft_offer-1',
    tokenExpiresAt: new Date(0),
    tokenInvalidatedAt: null,
    status: 'PENDING' as const,
    viewedAt: null,
    respondedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    offerId: 'offer-1',
    filename: 'proposal.pdf',
    storageKey: 'uploads/org-1/proposal.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 102400,
    sha256Hash: 'a'.repeat(64),
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeSender() {
  return { name: 'Bob Sender', email: 'bob@mycompany.com' };
}
