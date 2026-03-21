import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionService } from './subscription.service';

// ─── BillingModule ─────────────────────────────────────────────────────────────
// Global module — SubscriptionService is exported so other modules (e.g.
// OffersModule) can inject it for plan enforcement without importing BillingModule.
//
// Provides:
//   SubscriptionService  — plan queries, enforcement, Stripe state sync
//   BillingService       — Stripe API calls (checkout, portal, webhooks)
//
// Routes (under /api/v1/billing):
//   POST /checkout       — create Stripe Checkout session
//   GET  /portal         — create Stripe Customer Portal session
//   GET  /subscription   — current subscription state
//   POST /webhook        — Stripe webhook receiver (no JWT, signature-verified)

@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, SubscriptionService],
  exports: [SubscriptionService],
})
export class BillingModule {}
