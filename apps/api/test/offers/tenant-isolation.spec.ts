import { OffersService } from '../../src/modules/offers/services/offers.service';
import { NotFoundException } from '@nestjs/common';

// ─── Tenant Isolation Tests ────────────────────────────────────────────────────
//
// All offer queries MUST be scoped by organizationId. A user from Org A must
// never see, read, or mutate Org B's offers, even with a valid JWT.
//
// The OffersService enforces this by including `organizationId: orgId` in every
// DB WHERE clause. These tests verify that assumption holds for every query path
// by simulating a cross-tenant access attempt.
//
// Pattern: create a real offer owned by ORG_A, then attempt access with ORG_B's
// ID. The service must return NotFoundException (not expose data, not throw an
// unscoped error).

const ORG_A = 'org-a-111';
const ORG_B = 'org-b-222';
const OFFER_ID = 'offer-123';
const USER_A = 'user-a-1';

const OFFER_IN_ORG_A = {
  id: OFFER_ID,
  organizationId: ORG_A,
  createdById: USER_A,
  title: 'Offer for Org A',
  message: null,
  status: 'DRAFT' as const,
  expiresAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  recipient: null,
  documents: [],
  snapshot: null,
  _count: { documents: 0 },
};

function makeDb(offerInOrgA = OFFER_IN_ORG_A) {
  return {
    offer: {
      // Simulate real DB behaviour: findFirst returns null when WHERE doesn't match
      findFirst: jest.fn(({ where }: { where: { organizationId?: string; id?: string } }) => {
        if (
          where.id === OFFER_ID &&
          where.organizationId === ORG_A
        ) {
          return Promise.resolve(offerInOrgA);
        }
        return Promise.resolve(null); // no match → null, exactly like Prisma
      }),
      findMany: jest.fn(({ where }: { where: { organizationId?: string } }) => {
        if (where.organizationId === ORG_A) return Promise.resolve([offerInOrgA]);
        return Promise.resolve([]);
      }),
      count: jest.fn(({ where }: { where: { organizationId?: string } }) => {
        if (where.organizationId === ORG_A) return Promise.resolve(1);
        return Promise.resolve(0);
      }),
      create: jest.fn(),
      update: jest.fn(),
    },
    offerRecipient: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    offerDocument: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({
      offer: { create: jest.fn().mockResolvedValue(offerInOrgA) },
      offerRecipient: { create: jest.fn() },
    })),
  };
}

describe('OffersService — tenant isolation', () => {
  let service: OffersService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
    service = new OffersService(db as unknown as any);
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the offer when orgId matches', async () => {
      const result = await service.findOne(OFFER_ID, ORG_A);
      expect(result.id).toBe(OFFER_ID);
    });

    it('throws NotFoundException for a valid offerId belonging to a different org', async () => {
      await expect(service.findOne(OFFER_ID, ORG_B)).rejects.toThrow(NotFoundException);
    });

    it('passes organizationId to the DB query — not just the id', async () => {
      try { await service.findOne(OFFER_ID, ORG_B); } catch { /* expected */ }
      const call = db.offer.findFirst.mock.calls[0][0];
      expect(call.where).toMatchObject({ id: OFFER_ID, organizationId: ORG_B });
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns offers for the correct org', async () => {
      const result = await service.list(ORG_A, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('returns empty list for a different org that has no offers', async () => {
      const result = await service.list(ORG_B, 1, 20);
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('never returns another org\'s offers regardless of pagination', async () => {
      const result = await service.list(ORG_B, 1, 100);
      const orgBOwnedOffers = result.data.filter((o) => o.organizationId === ORG_A);
      expect(orgBOwnedOffers).toHaveLength(0);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when updating another org\'s offer', async () => {
      await expect(
        service.update(OFFER_ID, ORG_B, { title: 'Hijacked' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('passes organizationId in the requireDraft query', async () => {
      try { await service.update(OFFER_ID, ORG_B, { title: 'X' }); } catch { /* expected */ }
      const call = db.offer.findFirst.mock.calls[0][0];
      expect(call.where).toMatchObject({ id: OFFER_ID, organizationId: ORG_B });
    });
  });

  // ── requireDraft (shared guard) ───────────────────────────────────────────

  describe('requireDraft (shared org-scope guard)', () => {
    it('returns the offer when orgId matches and status is DRAFT', async () => {
      const offer = await service.requireDraft(OFFER_ID, ORG_A);
      expect(offer.id).toBe(OFFER_ID);
    });

    it('throws NotFoundException for cross-org access', async () => {
      await expect(service.requireDraft(OFFER_ID, ORG_B)).rejects.toThrow(NotFoundException);
    });

    it('never reveals whether the offer exists in another org (no data leak)', async () => {
      let error: unknown;
      try { await service.requireDraft(OFFER_ID, ORG_B); } catch (e) { error = e; }
      // Must be NotFoundException — not a different error that reveals existence
      expect(error).toBeInstanceOf(NotFoundException);
    });
  });

  // ── addDocument ───────────────────────────────────────────────────────────

  describe('addDocument', () => {
    it('throws NotFoundException when adding document to another org\'s offer', async () => {
      await expect(
        service.addDocument(OFFER_ID, ORG_B, {
          filename: 'doc.pdf',
          storageKey: 'key',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256Hash: 'abc123',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── setRecipient ──────────────────────────────────────────────────────────

  describe('setRecipient', () => {
    it('throws NotFoundException when setting recipient on another org\'s offer', async () => {
      await expect(
        service.setRecipient(OFFER_ID, ORG_B, { email: 'evil@example.com', name: 'Attacker' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
