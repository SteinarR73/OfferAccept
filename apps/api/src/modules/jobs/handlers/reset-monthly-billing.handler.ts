import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { SubscriptionService } from '../../billing/subscription.service';
import type { ResetMonthlyBillingPayload } from '../job.types';

// ─── ResetMonthlyBillingHandler ────────────────────────────────────────────────
// Resets the monthly offer-send counter for all active/trialing/past_due
// subscriptions on the first day of each month.
//
// This allows FREE / STARTER / PROFESSIONAL plan limits to refresh each month.
//
// Plan limits (offers / month):
//   FREE         → 3
//   STARTER      → 25
//   PROFESSIONAL → 100
//   ENTERPRISE   → unlimited (no counter needed, but reset anyway)
//
// Idempotency:
//   The cron schedule uses singletonKey='reset-monthly-billing:<YYYY-MM>' so
//   the job runs at most once per calendar month even if the scheduler fires
//   multiple times (e.g., after a restart on the 1st).
//
// Schedule: 0 0 1 * * — midnight on the 1st of every month (UTC).

@Injectable()
export class ResetMonthlyBillingHandler {
  private readonly logger = new Logger(ResetMonthlyBillingHandler.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  async handle(jobs: Job<ResetMonthlyBillingPayload>[]): Promise<void> {
    const count = await this.subscriptionService.resetMonthlyCount();
    this.logger.log(`Monthly billing reset: ${count} subscription(s) reset`);
    void jobs;
  }
}
