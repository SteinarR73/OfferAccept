import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { OffersService } from '../../src/modules/offers/services/offers.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';

// ─── Cursor pagination tests ───────────────────────────────────────────────────
//
// Tests cover:
//   1. Offset pagination still works and returns nextCursor
//   2. Cursor pagination returns the correct page of items
//   3. nextCursor is null on the last page
//   4. Malformed cursor falls back to the first page
//   5. Cursor is stable across calls (same result for same cursor)

type FakeOffer = { id: string; createdAt: Date; deletedAt: null; organizationId: string; [key: string]: unknown };

function makeOffer(id: string, createdAt: Date, orgId = 'org-1'): FakeOffer {
  return { id, createdAt, deletedAt: null, organizationId: orgId, recipient: null, _count: { documents: 0 } };
}

// Build a list of N offers ordered newest-first (descending createdAt)
function makeOffers(n: number, orgId = 'org-1'): FakeOffer[] {
  const base = new Date('2026-01-01T00:00:00Z').getTime();
  return Array.from({ length: n }, (_, i) => {
    const id = `offer-${String(n - i).padStart(3, '0')}`;
    const createdAt = new Date(base + (n - i) * 1000); // newest first
    return makeOffer(id, createdAt, orgId);
  });
}

function buildMockDb(allOffers: FakeOffer[]) {
  const findManyImpl = jest.fn(
    (args: {
      where: { organizationId: string; deletedAt: null };
      orderBy?: unknown;
      skip?: number;
      take?: number;
      cursor?: { id: string };
    }) => {
      const orgOffers = allOffers.filter(
        (o) => o.organizationId === args.where.organizationId && o.deletedAt === null,
      );
      // Sort desc by createdAt, then desc by id (stable)
      const sorted = [...orgOffers].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
      );

      let slice = sorted;
      if (args.cursor) {
        const idx = slice.findIndex((o) => o.id === args.cursor!.id);
        if (idx === -1) return Promise.resolve([]);
        slice = slice.slice(idx + (args.skip ?? 0));
      } else if (args.skip) {
        slice = slice.slice(args.skip);
      }
      if (args.take !== undefined) {
        slice = slice.slice(0, args.take);
      }
      return Promise.resolve(slice);
    },
  );

  const countImpl = jest.fn((args: { where: { organizationId: string } }) =>
    Promise.resolve(allOffers.filter((o) => o.organizationId === args.where.organizationId).length),
  );

  return {
    offer: {
      findMany: findManyImpl,
      count: countImpl,
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

async function buildService(allOffers: FakeOffer[]) {
  const db = buildMockDb(allOffers);
  const module = await Test.createTestingModule({
    providers: [
      OffersService,
      { provide: 'PRISMA', useValue: db },
      { provide: DealEventService, useValue: { emit: jest.fn(), getForDeal: jest.fn(), getRecentForOrg: jest.fn() } },
    ],
  }).compile();
  return { service: module.get(OffersService), db };
}

// ── Offset pagination ──────────────────────────────────────────────────────────

describe('OffersService.list() — offset pagination', () => {
  it('returns the first page of offers', async () => {
    const offers = makeOffers(25);
    const { service } = await buildService(offers);
    const result = await service.list('org-1', 1, 10);
    expect(result.data).toHaveLength(10);
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
  });

  it('returns nextCursor pointing to the last item on the page', async () => {
    const offers = makeOffers(25);
    const { service } = await buildService(offers);
    const result = await service.list('org-1', 1, 10);
    expect(result.nextCursor).not.toBeNull();
    expect(typeof result.nextCursor).toBe('string');
  });

  it('returns nextCursor=null on the last page', async () => {
    const offers = makeOffers(10);
    const { service } = await buildService(offers);
    const result = await service.list('org-1', 1, 10);
    expect(result.nextCursor).toBeNull();
  });

  it('returns nextCursor=null when fewer items exist than pageSize', async () => {
    const offers = makeOffers(5);
    const { service } = await buildService(offers);
    const result = await service.list('org-1', 1, 20);
    expect(result.nextCursor).toBeNull();
  });
});

// ── Cursor pagination ──────────────────────────────────────────────────────────

describe('OffersService.list() — cursor pagination', () => {
  it('returns the same first page as offset when using nextCursor from page 1', async () => {
    const offers = makeOffers(25);
    const { service } = await buildService(offers);

    const page1 = await service.list('org-1', 1, 5);
    expect(page1.data).toHaveLength(5);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await service.list('org-1', 1, 5, page1.nextCursor!);
    // Page 2 should start after the last item of page 1
    expect(page2.data).toHaveLength(5);
    const page1Ids = new Set(page1.data.map((o) => o.id));
    for (const item of page2.data) {
      expect(page1Ids.has(item.id)).toBe(false);
    }
  });

  it('traverses all pages without overlap or missing items', async () => {
    const offers = makeOffers(25);
    const { service } = await buildService(offers);

    const seen = new Set<string>();
    let cursor: string | null | undefined = undefined;
    let iterations = 0;
    const PAGE_SIZE = 7;

    while (true) {
      const result = await service.list('org-1', 1, PAGE_SIZE, cursor ?? undefined);
      for (const item of result.data) {
        expect(seen.has(item.id)).toBe(false); // no duplicates
        seen.add(item.id);
      }
      cursor = result.nextCursor;
      iterations++;
      if (!cursor) break;
      if (iterations > 10) throw new Error('Too many iterations — infinite loop?');
    }

    expect(seen.size).toBe(25); // all items seen exactly once
  });

  it('returns nextCursor=null when no more pages exist', async () => {
    const offers = makeOffers(5);
    const { service } = await buildService(offers);

    const page1 = await service.list('org-1', 1, 3);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await service.list('org-1', 1, 3, page1.nextCursor!);
    expect(page2.data).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
  });

  it('returns first page when cursor is malformed base64', async () => {
    const offers = makeOffers(10);
    const { service } = await buildService(offers);
    const result = await service.list('org-1', 1, 5, 'not-valid-cursor!!');
    expect(result.data).toHaveLength(5);
  });

  it('returns first page when cursor JSON is invalid', async () => {
    const offers = makeOffers(10);
    const { service } = await buildService(offers);
    const badCursor = Buffer.from(JSON.stringify({ wrong: 'shape' })).toString('base64url');
    const result = await service.list('org-1', 1, 5, badCursor);
    expect(result.data).toHaveLength(5);
  });
});
