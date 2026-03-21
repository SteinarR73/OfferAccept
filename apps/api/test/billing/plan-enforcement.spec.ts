import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { SubscriptionService } from '../../src/modules/billing/subscription.service';
import { PlanLimitExceededError } from '../../src/common/errors/domain.errors';

// ─── Plan enforcement tests ────────────────────────────────────────────────────
//
// Covers assertCanSendOffer() for all four plans:
//   FREE         — limit 3 offers/month
//   STARTER      — limit 25 offers/month
//   PROFESSIONAL — limit 100 offers/month
//   ENTERPRISE   — unlimited (null limit, counter bypassed)
//
// Also covers incrementOfferCount() and resetMonthlyCount() idempotency.

function buildMockDb(
  overrides: Partial<{
    plan: SubscriptionPlan;
    monthlyOfferCount: number;
    status: SubscriptionStatus;
    lastUsageReset: Date | null;
  }> = {},
) {
  const row = {
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.ACTIVE,
    monthlyOfferCount: 0,
    lastUsageReset: null,
    ...overrides,
  };

  return {
    subscription: {
      findUnique: jest.fn<() => Promise<typeof row | null>>().mockResolvedValue(row),
      upsert: jest.fn<() => Promise<typeof row>>().mockResolvedValue(row),
      updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    },
  };
}

async function buildService(
  dbOverrides: Parameters<typeof buildMockDb>[0] = {},
): Promise<{ service: SubscriptionService; db: ReturnType<typeof buildMockDb> }> {
  const db = buildMockDb(dbOverrides);

  const module = await Test.createTestingModule({
    providers: [
      SubscriptionService,
      { provide: 'PRISMA', useValue: db },
    ],
  }).compile();

  return { service: module.get(SubscriptionService), db };
}

// ── assertCanSendOffer: FREE plan ──────────────────────────────────────────────

describe('assertCanSendOffer – FREE plan (limit 3)', () => {
  it('allows 0 offers', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.FREE, monthlyOfferCount: 0 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });

  it('allows 1 offer', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.FREE, monthlyOfferCount: 1 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });

  it('allows 2 offers', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.FREE, monthlyOfferCount: 2 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });

  it('allows exactly 3 offers (at limit)', async () => {
    // count === limit: 3 === 3 means already at limit
    // Our check is count >= limit, so count=3 should throw
    const { service } = await buildService({ plan: SubscriptionPlan.FREE, monthlyOfferCount: 3 });
    await expect(service.assertCanSendOffer('org-1')).rejects.toThrow(PlanLimitExceededError);
  });

  it('throws PlanLimitExceededError at 4 offers', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.FREE, monthlyOfferCount: 4 });
    const err = await service.assertCanSendOffer('org-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanLimitExceededError);
    expect((err as PlanLimitExceededError).plan).toBe('FREE');
    expect((err as PlanLimitExceededError).limit).toBe(3);
  });
});

// ── assertCanSendOffer: STARTER plan ──────────────────────────────────────────

describe('assertCanSendOffer – STARTER plan (limit 25)', () => {
  it('allows 24 offers', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.STARTER, monthlyOfferCount: 24 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });

  it('throws at 25 offers (at limit)', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.STARTER, monthlyOfferCount: 25 });
    await expect(service.assertCanSendOffer('org-1')).rejects.toThrow(PlanLimitExceededError);
  });

  it('throws at 26 offers', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.STARTER, monthlyOfferCount: 26 });
    const err = await service.assertCanSendOffer('org-1').catch((e: unknown) => e);
    expect((err as PlanLimitExceededError).limit).toBe(25);
  });
});

// ── assertCanSendOffer: PROFESSIONAL plan ─────────────────────────────────────

describe('assertCanSendOffer – PROFESSIONAL plan (limit 100)', () => {
  it('allows 99 offers', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.PROFESSIONAL, monthlyOfferCount: 99 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });

  it('throws at 100 offers', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.PROFESSIONAL, monthlyOfferCount: 100 });
    await expect(service.assertCanSendOffer('org-1')).rejects.toThrow(PlanLimitExceededError);
  });
});

// ── assertCanSendOffer: ENTERPRISE plan ───────────────────────────────────────

describe('assertCanSendOffer – ENTERPRISE plan (unlimited)', () => {
  it('allows any number of offers — 0', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.ENTERPRISE, monthlyOfferCount: 0 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });

  it('allows any number of offers — 10000', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.ENTERPRISE, monthlyOfferCount: 10000 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });

  it('does NOT throw regardless of monthlyOfferCount', async () => {
    const { service } = await buildService({ plan: SubscriptionPlan.ENTERPRISE, monthlyOfferCount: 999999 });
    await expect(service.assertCanSendOffer('org-1')).resolves.not.toThrow();
  });
});

// ── assertCanSendOffer: missing subscription row ───────────────────────────────

describe('assertCanSendOffer – no subscription row (defaults to FREE)', () => {
  it('treats missing subscription as FREE plan', async () => {
    const db = buildMockDb();
    db.subscription.findUnique.mockResolvedValue(null as never);
    const module = await Test.createTestingModule({
      providers: [SubscriptionService, { provide: 'PRISMA', useValue: db }],
    }).compile();
    const service = module.get(SubscriptionService);

    // With count=0 (default) and FREE limit=3, should pass
    await expect(service.assertCanSendOffer('org-new')).resolves.not.toThrow();
  });
});

// ── incrementOfferCount ────────────────────────────────────────────────────────

describe('incrementOfferCount', () => {
  it('calls upsert with increment: 1', async () => {
    const { service, db } = await buildService();
    await service.incrementOfferCount('org-1');
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ monthlyOfferCount: { increment: 1 } }),
      }),
    );
  });

  it('creates a FREE/TRIALING subscription if none exists', async () => {
    const { service, db } = await buildService();
    await service.incrementOfferCount('org-new');
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.TRIALING,
          monthlyOfferCount: 1,
        }),
      }),
    );
  });
});

// ── resetMonthlyCount — idempotency ───────────────────────────────────────────

describe('resetMonthlyCount', () => {
  it('calls updateMany and returns affected count', async () => {
    const { service, db } = await buildService();
    db.subscription.updateMany.mockResolvedValue({ count: 42 } as never);

    const count = await service.resetMonthlyCount();
    expect(count).toBe(42);
    expect(db.subscription.updateMany).toHaveBeenCalledTimes(1);
  });

  it('includes lastUsageReset guard in where clause', async () => {
    const { service, db } = await buildService();
    await service.resetMonthlyCount();

    const whereArg = (db.subscription.updateMany.mock.calls[0] as unknown[])[0] as {
      where: { OR: unknown[] };
    };
    expect(whereArg.where.OR).toBeDefined();
    expect(whereArg.where.OR).toHaveLength(2); // null check + lt firstOfMonth
  });

  it('sets lastUsageReset in data', async () => {
    const { service, db } = await buildService();
    await service.resetMonthlyCount();

    const dataArg = (db.subscription.updateMany.mock.calls[0] as unknown[])[0] as {
      data: { monthlyOfferCount: number; lastUsageReset: Date };
    };
    expect(dataArg.data.monthlyOfferCount).toBe(0);
    expect(dataArg.data.lastUsageReset).toBeInstanceOf(Date);
  });

  it('returns 0 if no subscriptions matched (already reset)', async () => {
    const { service, db } = await buildService();
    db.subscription.updateMany.mockResolvedValue({ count: 0 } as never);

    const count = await service.resetMonthlyCount();
    expect(count).toBe(0);
  });
});
