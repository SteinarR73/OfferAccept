import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { BillingService } from '../../src/modules/billing/billing.service';
import { SubscriptionService } from '../../src/modules/billing/subscription.service';

// ─── Webhook sync tests ────────────────────────────────────────────────────────
//
// Covers BillingService.handleWebhookEvent() for all relevant Stripe events:
//   subscription.created    → syncFromStripe called with correct plan + status
//   subscription.updated    → same as created; handles cancelAtPeriodEnd
//   subscription.deleted    → markCanceled called
//   invoice.payment_succeeded → re-fetches subscription and syncs ACTIVE
//   invoice.payment_failed  → fetches via customer, syncs PAST_DUE
//
// Idempotency:
//   Sending the same subscription.updated event twice results in exactly two
//   syncFromStripe calls (each overwrites the same row — correct by design).
//   Database upsert is the idempotency mechanism; BillingService does not
//   deduplicate at the application layer.
//
// Signature verification:
//   constructEvent() is mocked — unit tests focus on dispatch logic, not
//   Stripe crypto. Signature verification is integration-tested separately.

const CUSTOMER_ID = 'cus_test_123';
const SUB_ID = 'sub_test_456';
const STARTER_PRICE_ID = 'price_starter_001';

// ── Minimal Stripe object builders ────────────────────────────────────────────

function makeSubscription(
  overrides: Partial<{
    status: Stripe.Subscription.Status;
    cancelAtPeriodEnd: boolean;
    priceId: string;
  }> = {},
): Stripe.Subscription {
  return {
    id: SUB_ID,
    object: 'subscription',
    customer: CUSTOMER_ID,
    status: overrides.status ?? 'active',
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_001',
          object: 'subscription_item',
          price: {
            id: overrides.priceId ?? STARTER_PRICE_ID,
          } as Stripe.Price,
          current_period_start: Math.floor(Date.now() / 1000) - 86400,
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 29,
        } as unknown as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '',
    },
  } as unknown as Stripe.Subscription;
}

function makeInvoice(
  overrides: Partial<{
    customerId: string;
    subscriptionId: string;
  }> = {},
): Stripe.Invoice {
  return {
    id: 'in_test_789',
    object: 'invoice',
    customer: overrides.customerId ?? CUSTOMER_ID,
    parent: {
      subscription_details: {
        subscription: overrides.subscriptionId ?? SUB_ID,
      },
    },
  } as unknown as Stripe.Invoice;
}

function makeEvent(type: string, data: object): Stripe.Event {
  return {
    id: `evt_${Date.now()}`,
    object: 'event',
    type,
    data: { object: data },
    livemode: false,
  } as unknown as Stripe.Event;
}

// ── Test harness ──────────────────────────────────────────────────────────────

function buildMocks() {
  const subscriptionSvcMock = {
    syncFromStripe: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    markCanceled: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getStripeCustomerId: jest.fn<() => Promise<string | null>>().mockResolvedValue(CUSTOMER_ID),
    setStripeCustomerId: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const stripeMock = {
    webhooks: {
      constructEvent: jest.fn<(rawBody: Buffer, sig: string, secret: string) => Stripe.Event>(),
    },
    customers: {
      create: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: CUSTOMER_ID }),
    },
    subscriptions: {
      list: jest.fn<() => Promise<{ data: Stripe.Subscription[] }>>().mockResolvedValue({
        data: [makeSubscription()],
      }),
      retrieve: jest.fn<() => Promise<Stripe.Subscription>>().mockResolvedValue(makeSubscription()),
    },
  };

  const configMock = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        STRIPE_PRICE_STARTER: STARTER_PRICE_ID,
        STRIPE_PRICE_PROFESSIONAL: 'price_pro_001',
        STRIPE_PRICE_ENTERPRISE: 'price_ent_001',
        WEB_BASE_URL: 'http://localhost:3000',
      };
      return map[key];
    }),
  };

  const dbMock = {
    organization: {
      findUnique: jest.fn<() => Promise<{ name: string; users: { email: string }[] } | null>>()
        .mockResolvedValue({ name: 'Test Org', users: [{ email: 'owner@example.com' }] }),
    },
  };

  return { subscriptionSvcMock, stripeMock, configMock, dbMock };
}

async function buildService(mocks: ReturnType<typeof buildMocks>) {
  const module = await Test.createTestingModule({
    providers: [
      BillingService,
      { provide: SubscriptionService, useValue: mocks.subscriptionSvcMock },
      { provide: ConfigService, useValue: mocks.configMock },
      { provide: 'PRISMA', useValue: mocks.dbMock },
    ],
  }).compile();

  const service = module.get(BillingService);
  // Inject the mocked Stripe instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (service as any).stripe = mocks.stripeMock;

  return service;
}

// ── subscription.created ──────────────────────────────────────────────────────

describe('handleWebhookEvent – subscription.created', () => {
  it('calls syncFromStripe with correct plan and status', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const sub = makeSubscription({ status: 'active', priceId: STARTER_PRICE_ID });
    const event = makeEvent('customer.subscription.created', sub);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.subscriptionSvcMock.syncFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: SUB_ID,
        stripeCustomerId: CUSTOMER_ID,
        plan: SubscriptionPlan.STARTER,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
      }),
    );
  });
});

// ── subscription.updated — cancelAtPeriodEnd ──────────────────────────────────

describe('handleWebhookEvent – subscription.updated with cancelAtPeriodEnd', () => {
  it('syncs cancelAtPeriodEnd=true and keeps plan unchanged', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const sub = makeSubscription({ status: 'active', cancelAtPeriodEnd: true });
    const event = makeEvent('customer.subscription.updated', sub);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.subscriptionSvcMock.syncFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelAtPeriodEnd: true,
        plan: SubscriptionPlan.STARTER,
        status: SubscriptionStatus.ACTIVE,
      }),
    );
  });

  it('syncs cancelAtPeriodEnd=false when customer re-activates', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const sub = makeSubscription({ status: 'active', cancelAtPeriodEnd: false });
    const event = makeEvent('customer.subscription.updated', sub);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.subscriptionSvcMock.syncFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAtPeriodEnd: false }),
    );
  });
});

// ── subscription.deleted ──────────────────────────────────────────────────────

describe('handleWebhookEvent – subscription.deleted', () => {
  it('calls markCanceled with the customer ID', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const sub = makeSubscription({ status: 'canceled' });
    const event = makeEvent('customer.subscription.deleted', sub);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.subscriptionSvcMock.markCanceled).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(mocks.subscriptionSvcMock.syncFromStripe).not.toHaveBeenCalled();
  });
});

// ── invoice.payment_succeeded ─────────────────────────────────────────────────

describe('handleWebhookEvent – invoice.payment_succeeded', () => {
  it('re-fetches subscription from Stripe and syncs', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const invoice = makeInvoice();
    const event = makeEvent('invoice.payment_succeeded', invoice);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);
    mocks.stripeMock.subscriptions.retrieve.mockResolvedValue(makeSubscription({ status: 'active' }) as never);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.stripeMock.subscriptions.retrieve).toHaveBeenCalledWith(SUB_ID);
    expect(mocks.subscriptionSvcMock.syncFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
    );
  });
});

// ── invoice.payment_failed ────────────────────────────────────────────────────

describe('handleWebhookEvent – invoice.payment_failed', () => {
  it('fetches latest subscription and syncs PAST_DUE', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const invoice = makeInvoice();
    const event = makeEvent('invoice.payment_failed', invoice);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);
    mocks.stripeMock.subscriptions.list.mockResolvedValue({
      data: [makeSubscription({ status: 'past_due' })],
    } as never);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.subscriptionSvcMock.syncFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ status: SubscriptionStatus.PAST_DUE }),
    );
  });
});

// ── Idempotency — same event twice ────────────────────────────────────────────

describe('handleWebhookEvent – idempotency', () => {
  it('handles the same subscription.updated event twice without error', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const sub = makeSubscription({ status: 'active' });
    const event = makeEvent('customer.subscription.updated', sub);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    // Send the same event twice — simulates Stripe retry.
    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');
    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    // syncFromStripe is called twice — upsert handles deduplication in the DB layer.
    expect(mocks.subscriptionSvcMock.syncFromStripe).toHaveBeenCalledTimes(2);
  });
});

// ── Unknown event type ────────────────────────────────────────────────────────

describe('handleWebhookEvent – unknown event type', () => {
  it('does not throw and does not call syncFromStripe', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const event = makeEvent('payment_intent.created', {});
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await expect(
      service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig'),
    ).resolves.not.toThrow();

    expect(mocks.subscriptionSvcMock.syncFromStripe).not.toHaveBeenCalled();
    expect(mocks.subscriptionSvcMock.markCanceled).not.toHaveBeenCalled();
  });
});

// ── Signature verification failure ────────────────────────────────────────────

describe('handleWebhookEvent – signature verification', () => {
  it('re-throws when constructEvent fails (bad signature)', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    mocks.stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    await expect(
      service.handleWebhookEvent(Buffer.from('tampered'), 'bad-sig'),
    ).rejects.toThrow('No signatures found');

    expect(mocks.subscriptionSvcMock.syncFromStripe).not.toHaveBeenCalled();
  });
});

// ── Downgrade flow (via cancelAtPeriodEnd) ────────────────────────────────────

describe('downgrade flow', () => {
  it('preserves current plan when cancelAtPeriodEnd=true (access continues until period end)', async () => {
    // Scenario: PRO subscriber cancels → Stripe sends updated with cancel_at_period_end=true
    // The price ID is still PRO — plan in DB stays PROFESSIONAL until period ends.
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const sub = makeSubscription({
      status: 'active',
      cancelAtPeriodEnd: true,
      priceId: 'price_pro_001',
    });
    const event = makeEvent('customer.subscription.updated', sub);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.subscriptionSvcMock.syncFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: SubscriptionPlan.PROFESSIONAL,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: true,
      }),
    );
    // Plan enforcement is NOT changed at this point — user keeps PRO access
    // until subscription.deleted fires at period end.
  });

  it('cancels subscription when subscription.deleted fires at period end', async () => {
    const mocks = buildMocks();
    const service = await buildService(mocks);
    const sub = makeSubscription({ status: 'canceled', priceId: 'price_pro_001' });
    const event = makeEvent('customer.subscription.deleted', sub);
    mocks.stripeMock.webhooks.constructEvent.mockReturnValue(event);

    await service.handleWebhookEvent(Buffer.from('{}'), 'stripe-sig');

    expect(mocks.subscriptionSvcMock.markCanceled).toHaveBeenCalledWith(CUSTOMER_ID);
  });
});
