import { Module } from '@nestjs/common';

// Bounded context: Billing
// Responsible for: Stripe webhook handling, subscription state management,
// plan enforcement (feature gates, usage limits), and customer portal.
//
// Billing deliberately does not own business logic. It owns subscription
// state and exposes a simple `SubscriptionService.getPlan(orgId)` for
// other modules to query.
//
// Not yet implemented — module stub ready for feature development.

@Module({})
export class BillingModule {}
