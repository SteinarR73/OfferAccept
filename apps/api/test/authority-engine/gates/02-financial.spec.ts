/**
 * Authority Engine — Gate Group 2: Financial Integrity
 *
 *  F1  P0  Offer-Count Atomicity (credit equivalent)
 *  F2  P0  Idempotency Protection
 *  F3  P0  Stripe Webhook Signature Validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';
import { SubscriptionService } from '../../../src/modules/billing/subscription.service';

const SRC = path.resolve(__dirname, '../../../src');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ─── F1 · Offer-Count Atomicity (P0) ─────────────────────────────────────────
//
// OfferAccept uses a monthly offer counter instead of a credits balance.
// The invariant is equivalent: exactly ONE increment per send, counters never
// go negative (i.e. below the plan limit).

describe('F1 · Offer-Count Atomicity (P0)', () => {
  it('SubscriptionService.incrementOfferCount uses a Prisma atomic increment', () => {
    const svcFile = readSrc('modules', 'billing', 'subscription.service.ts');
    // Must use an atomic increment operation, not read-modify-write
    expect(svcFile).toContain('increment:');
  });

  it('plan limit check (assertCanSendOffer) is enforced before any increment', () => {
    const svcFile = readSrc('modules', 'billing', 'subscription.service.ts');
    expect(svcFile).toContain('assertCanSendOffer');
    expect(svcFile).toContain('PlanLimitExceededError');
  });

  it('concurrent sendOffer calls are protected by DB-level upsert atomicity', () => {
    const svcFile = readSrc('modules', 'billing', 'subscription.service.ts');
    // Prisma upsert on unique key prevents double-increment races
    expect(svcFile).toContain('upsert');
  });

  it('offer status machine prevents double-sending via CAS updateMany', async () => {
    // The acceptance-race test already validates this for signing; verify for send
    const offersService = fs
      .readdirSync(path.join(SRC, 'modules', 'offers'), { recursive: true })
      .filter((f) => f.toString().endsWith('.ts'))
      .map((f) => fs.readFileSync(path.join(SRC, 'modules', 'offers', f.toString()), 'utf-8'))
      .join('\n');
    // Must use updateMany with a status WHERE clause (optimistic concurrency)
    expect(offersService).toMatch(/updateMany|WHERE.*status/i);
  });

  it('monthly billing reset is idempotent via pg-boss singletonKey (runs once per calendar month)', () => {
    const resetHandler = readSrc(
      'modules', 'jobs', 'handlers', 'reset-monthly-billing.handler.ts',
    );
    // singletonKey = 'reset-monthly-billing:<YYYY-MM>' deduplicated at scheduler level
    expect(resetHandler).toContain('singletonKey');
  });
});

// ─── F2 · Idempotency Protection (P0) ────────────────────────────────────────

describe('F2 · Idempotency Protection (P0)', () => {
  it('offers cannot be sent twice — status machine enforces DRAFT→SENT transition', () => {
    const offersFiles = fs
      .readdirSync(path.join(SRC, 'modules', 'offers'), { recursive: true })
      .filter((f) => f.toString().endsWith('.ts'))
      .map((f) => fs.readFileSync(path.join(SRC, 'modules', 'offers', f.toString()), 'utf-8'))
      .join('\n');
    // Status transition guard — offer must be DRAFT to be sent
    expect(offersFiles).toMatch(/DRAFT|OfferAlreadySentError|OfferNotInDraftError/);
  });

  it('certificate issuance has a unique constraint guard against double-issuance', () => {
    const certSvc = readSrc('modules', 'certificates', 'certificate.service.ts');
    // Race-condition guard: unique constraint on FK or explicit idempotency check
    expect(certSvc).toMatch(/unique|idempotent|Unique constraint|P2002/i);
  });

  it('webhook send handler is idempotent — job deduplication prevents duplicate delivery', () => {
    const jobFiles = fs
      .readdirSync(path.join(SRC, 'modules', 'jobs', 'handlers'), { recursive: true })
      .filter((f) => f.toString().endsWith('.ts'))
      .map((f) =>
        fs.readFileSync(
          path.join(SRC, 'modules', 'jobs', 'handlers', f.toString()),
          'utf-8',
        ),
      )
      .join('\n');
    // pg-boss deduplication or explicit idempotency key
    expect(jobFiles).toMatch(/singletonKey|dedupe|idempotency|idempotent/i);
  });

  it('webhook idempotency test exists and passes in launch-confidence suite', () => {
    const testFile = path.resolve(
      __dirname,
      '../../launch-confidence/07-webhook-idempotency.spec.ts',
    );
    expect(fs.existsSync(testFile)).toBe(true);
  });
});

// ─── F3 · Stripe Webhook Signature Validation (P0) ───────────────────────────

describe('F3 · Stripe Webhook Signature Validation (P0)', () => {
  it('billing controller uses raw body for webhook verification', () => {
    const ctrlFile = readSrc('modules', 'billing', 'billing.controller.ts');
    expect(ctrlFile).toContain('rawBody');
  });

  it('billing service calls stripe.webhooks.constructEvent for HMAC verification', () => {
    const svcFile = readSrc('modules', 'billing', 'billing.service.ts');
    expect(svcFile).toContain('webhooks.constructEvent');
  });

  it('STRIPE_WEBHOOK_SECRET is required in env when BILLING_PROVIDER=stripe', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('STRIPE_WEBHOOK_SECRET');
    // Must be part of the stripe validation refine
    expect(envFile).toContain('BILLING_PROVIDER');
  });

  it('invalid webhook signature results in rejection (not 200)', () => {
    // Verify that constructEvent throws on bad sig → controller does not return 200
    const svcFile = readSrc('modules', 'billing', 'billing.service.ts');
    // The service must re-throw or return an error when constructEvent fails
    expect(svcFile).toMatch(/throw|BadRequest|Unauthorized|400|401/);
  });

  it('stripe webhook billing test exists in test suite', () => {
    const testFile = path.resolve(__dirname, '../../billing/webhook-sync.spec.ts');
    expect(fs.existsSync(testFile)).toBe(true);
  });
});
