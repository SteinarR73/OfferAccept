import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient, SubscriptionPlan, SubscriptionStatus, Subscription } from '@prisma/client';
import { PlanLimitExceededError } from '../../common/errors/domain.errors';
import { AdminSettingsService } from '../admin/admin-settings.service';

// ─── SubscriptionService ───────────────────────────────────────────────────────
// Source-of-truth for subscription state and plan enforcement.
//
// Exported from BillingModule and injected wherever plan gates are needed
// (e.g., OffersModule before sending an offer).
//
// Plan limits are dynamic and read from AdminSettingsService.
// ENTERPRISE is unlimited.
//
// monthlyOfferCount is reset to 0 on the first of each month by the
// reset-monthly-billing cron job. Plan enforcement is therefore eventually
// consistent with a 1-month window.

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly adminSettings: AdminSettingsService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getSubscription(organizationId: string): Promise<Subscription | null> {
    return this.db.subscription.findUnique({ where: { organizationId } });
  }

  async getPlan(organizationId: string): Promise<SubscriptionPlan> {
    const sub = await this.db.subscription.findUnique({
      where: { organizationId },
      select: { plan: true },
    });
    return sub?.plan ?? SubscriptionPlan.FREE;
  }

  // Returns true when the subscription allows full feature access.
  // PAST_DUE retains access (grace period); CANCELED does not.
  async isActive(organizationId: string): Promise<boolean> {
    const sub = await this.db.subscription.findUnique({
      where: { organizationId },
      select: { status: true },
    });
    if (!sub) return false;
    return sub.status === SubscriptionStatus.ACTIVE ||
           sub.status === SubscriptionStatus.TRIALING ||
           sub.status === SubscriptionStatus.PAST_DUE;
  }

  // ── Plan enforcement ──────────────────────────────────────────────────────

  // Throws PlanLimitExceededError if the organisation has sent too many offers
  // this month for their current plan. ENTERPRISE is unlimited.
  async assertCanSendOffer(organizationId: string): Promise<void> {
    const sub = await this.db.subscription.findUnique({
      where: { organizationId },
      select: { plan: true, monthlyOfferCount: true, status: true },
    });

    const isActuallyActive = sub ? (
      sub.status === SubscriptionStatus.ACTIVE ||
      sub.status === SubscriptionStatus.TRIALING ||
      sub.status === SubscriptionStatus.PAST_DUE
    ) : true; // No sub = default FREE tier

    // No subscription row means FREE tier (created at signup).
    // If subscription exists but is not active (CANCELED, UNPAID, INCOMPLETE), fallback to FREE limits.
    const plan = (!sub || !isActuallyActive) ? SubscriptionPlan.FREE : sub.plan;
    const count = sub?.monthlyOfferCount ?? 0;
    
    const settings = await this.adminSettings.getAll();
    const planLimits: Record<SubscriptionPlan, number | null> = {
      FREE: settings.max_offers_free_monthly,
      STARTER: settings.max_offers_starter_monthly,
      PROFESSIONAL: settings.max_offers_professional_monthly,
      ENTERPRISE: null,
    };
    const limit = planLimits[plan];

    if (limit !== null && count >= limit) {
      this.logger.warn(
        `Plan limit reached: orgId=${organizationId} plan=${plan} count=${count} limit=${limit} (active=${isActuallyActive})`,
      );
      throw new PlanLimitExceededError(plan, limit);
    }
  }

  // Atomically increments the monthly offer counter.
  // Call immediately after a successful offer send.
  async incrementOfferCount(organizationId: string): Promise<void> {
    await this.db.subscription.upsert({
      where: { organizationId },
      update: { monthlyOfferCount: { increment: 1 } },
      create: {
        organizationId,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.TRIALING,
        monthlyOfferCount: 1,
      },
    });
  }

  // Resets the monthly counter for all active/trialing/past_due subscriptions.
  // Called by the reset-monthly-billing cron job on the 1st of each month.
  //
  // Idempotency guard: skips rows whose lastUsageReset already falls within the
  // current calendar month. Safe to call multiple times in the same month
  // (e.g. after a scheduler restart on the 1st of the month).
  async resetMonthlyCount(): Promise<number> {
    const now = new Date();
    // First moment of the current calendar month in UTC.
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const result = await this.db.subscription.updateMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE] },
        // Only reset rows that haven't been reset yet this calendar month.
        OR: [
          { lastUsageReset: null },
          { lastUsageReset: { lt: firstOfMonth } },
        ],
      },
      data: { monthlyOfferCount: 0, lastUsageReset: now },
    });
    return result.count;
  }

  // ── Stripe state sync ─────────────────────────────────────────────────────

  // Upserts subscription state from a Stripe event. Called by BillingService
  // after constructing and validating the Stripe webhook event.
  async syncFromStripe(params: {
    organizationId?: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  }): Promise<void> {
    // Resolve orgId from stripeCustomerId when not provided.
    let orgId = params.organizationId;
    if (!orgId) {
      const existing = await this.db.subscription.findUnique({
        where: { stripeCustomerId: params.stripeCustomerId },
        select: { organizationId: true },
      });
      orgId = existing?.organizationId;
    }

    if (!orgId) {
      this.logger.warn(
        `syncFromStripe: no org found for stripeCustomerId=${params.stripeCustomerId}`,
      );
      return;
    }

    await this.db.subscription.upsert({
      where: { organizationId: orgId },
      update: {
        plan: params.plan,
        status: params.status,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripeCustomerId: params.stripeCustomerId,
      },
      create: {
        organizationId: orgId,
        plan: params.plan,
        status: params.status,
        currentPeriodStart: params.currentPeriodStart,
        currentPeriodEnd: params.currentPeriodEnd,
        cancelAtPeriodEnd: params.cancelAtPeriodEnd,
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripeCustomerId: params.stripeCustomerId,
      },
    });
  }

  // Sets subscription status to CANCELED when a subscription is deleted in Stripe.
  async markCanceled(stripeCustomerId: string): Promise<void> {
    await this.db.subscription.updateMany({
      where: { stripeCustomerId },
      data: { 
        status: SubscriptionStatus.CANCELED, 
        cancelAtPeriodEnd: false,
        plan: SubscriptionPlan.FREE 
      },
    });
  }

  // Stores the Stripe customer ID for a new or existing subscription.
  async setStripeCustomerId(organizationId: string, stripeCustomerId: string): Promise<void> {
    await this.db.subscription.upsert({
      where: { organizationId },
      update: { stripeCustomerId },
      create: {
        organizationId,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.TRIALING,
        stripeCustomerId,
      },
    });
  }

  async getStripeCustomerId(organizationId: string): Promise<string | null> {
    const sub = await this.db.subscription.findUnique({
      where: { organizationId },
      select: { stripeCustomerId: true },
    });
    return sub?.stripeCustomerId ?? null;
  }
}
