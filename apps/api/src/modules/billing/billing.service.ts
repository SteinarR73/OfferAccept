import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import type { Env } from '../../config/env';

// ─── BillingService ────────────────────────────────────────────────────────────
// Owns all Stripe API communication.
//
// Responsibilities:
//   - Create / retrieve Stripe Customer objects (1:1 with Organisation)
//   - Create Checkout sessions (hosted payment page)
//   - Create Customer Portal sessions (self-service subscription management)
//   - Handle incoming Stripe webhook events and delegate state sync to
//     SubscriptionService
//
// Plan ↔ Stripe price mapping:
//   Driven by STRIPE_PRICE_STARTER / PROFESSIONAL / ENTERPRISE env vars.
//   These are set in Stripe and configured per deployment environment.
//   We look up the matching plan from the price ID on each webhook event.
//
// Webhook events handled:
//   customer.subscription.created   → sync plan + status
//   customer.subscription.updated   → sync plan + status (handles downgrades,
//                                     cancel_at_period_end)
//   customer.subscription.deleted   → mark CANCELED
//   invoice.payment_succeeded       → ensure status = ACTIVE
//   invoice.payment_failed          → set status = PAST_DUE

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;

  // Maps Stripe price IDs to our SubscriptionPlan enum.
  // Built once at construction from env vars.
  private readonly priceToplan: Map<string, SubscriptionPlan>;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly subscriptionService: SubscriptionService,
    @Inject('PRISMA') private readonly db: PrismaClient,
  ) {
    const secretKey = this.config.get('STRIPE_SECRET_KEY', { infer: true }) ?? '';

    this.stripe = new Stripe(secretKey, {
      // Pin the API version to the one we tested against.
      // Upgrade deliberately with a changelog review.
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });

    const starter = this.config.get('STRIPE_PRICE_STARTER', { infer: true });
    const professional = this.config.get('STRIPE_PRICE_PROFESSIONAL', { infer: true });
    const enterprise = this.config.get('STRIPE_PRICE_ENTERPRISE', { infer: true });

    this.priceToplan = new Map<string, SubscriptionPlan>();
    if (starter) this.priceToplan.set(starter, SubscriptionPlan.STARTER);
    if (professional) this.priceToplan.set(professional, SubscriptionPlan.PROFESSIONAL);
    if (enterprise) this.priceToplan.set(enterprise, SubscriptionPlan.ENTERPRISE);
  }

  // ── Customer ──────────────────────────────────────────────────────────────

  // Returns the existing Stripe Customer ID for the org, or creates a new one.
  // Resolves org name and owner email from the DB when creating a new customer.
  // The customer ID is persisted via SubscriptionService so this is idempotent.
  async getOrCreateCustomer(organizationId: string): Promise<string> {
    const existing = await this.subscriptionService.getStripeCustomerId(organizationId);
    if (existing) return existing;

    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        users: {
          where: { role: 'OWNER' },
          select: { email: true },
          take: 1,
        },
      },
    });

    const email = org?.users[0]?.email ?? '';
    const name = org?.name ?? '';

    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata: { organizationId },
    });

    await this.subscriptionService.setStripeCustomerId(organizationId, customer.id);
    this.logger.log(`Stripe customer created: customerId=${customer.id} orgId=${organizationId}`);

    return customer.id;
  }

  // ── Checkout ──────────────────────────────────────────────────────────────

  // Creates a Stripe Checkout session for a plan upgrade.
  // Returns the hosted checkout URL to redirect the user to.
  //
  // successUrl / cancelUrl are the pages Stripe redirects to after payment.
  // userId is included in metadata for webhook audit trails.
  async createCheckoutSession(
    organizationId: string,
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    const customerId = await this.getOrCreateCustomer(organizationId);

    // Resolve plan name for metadata — helps webhook handlers and support staff.
    const planName = this.priceToplan.get(priceId)?.toString() ?? 'UNKNOWN';

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Metadata is visible in the Stripe dashboard and passed through to webhooks.
      // Never include PII beyond what is necessary for routing.
      metadata: { organizationId, userId, plan: planName },
      // Allow promotion codes for discounts.
      allow_promotion_codes: true,
      // Collect billing address for tax calculation / invoices.
      billing_address_collection: 'auto',
    });

    if (!session.url) {
      throw new Error(`[BillingService] Stripe checkout session created without URL: ${session.id}`);
    }

    this.logger.log(
      `Checkout session created: sessionId=${session.id} orgId=${organizationId} priceId=${priceId}`,
    );

    return session.url;
  }

  // ── Customer Portal ───────────────────────────────────────────────────────

  // Creates a Stripe Customer Portal session for self-service subscription management.
  // The portal allows customers to upgrade/downgrade, cancel, and view invoices.
  // Returns the portal URL to redirect the user to.
  async createPortalSession(organizationId: string, returnUrl: string): Promise<string> {
    const customerId = await this.getOrCreateCustomer(organizationId);

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    this.logger.log(`Portal session created: orgId=${organizationId}`);
    return session.url;
  }

  // ── Webhook handling ──────────────────────────────────────────────────────

  // Verifies the Stripe webhook signature and dispatches the event.
  //
  // Throws if signature verification fails — the controller must return 400
  // in that case so Stripe retries.
  //
  // For unknown event types we log and return silently (do NOT throw) so that
  // Stripe receives a 200 and does not retry indefinitely.
  async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true }) ?? '';

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Re-throw so the controller can return 400.
      throw err;
    }

    this.logger.log(`Stripe webhook received: type=${event.type} id=${event.id}`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.log(`Stripe webhook: unhandled event type '${event.type}' — ignored`);
    }
  }

  // ── Stripe re-sync ────────────────────────────────────────────────────────

  // Re-fetches the subscription state from Stripe and syncs it to the database.
  // Useful for debugging, recovery after missed webhooks, or support tooling.
  // Does NOT alter monthlyOfferCount or lastUsageReset.
  async resyncFromStripe(organizationId: string): Promise<void> {
    const customerId = await this.subscriptionService.getStripeCustomerId(organizationId);
    if (!customerId) {
      this.logger.warn(`resyncFromStripe: no Stripe customer for orgId=${organizationId}`);
      throw new (await import('../../common/errors/domain.errors')).BillingCustomerNotFoundError();
    }

    const subs = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1,
    });

    if (subs.data.length === 0) {
      this.logger.log(`resyncFromStripe: no subscriptions found for orgId=${organizationId}`);
      return;
    }

    await this.handleSubscriptionUpsert(subs.data[0]);
    this.logger.log(`resyncFromStripe: synced subscription for orgId=${organizationId}`);
  }

  // ── Private webhook handlers ──────────────────────────────────────────────

  private async handleSubscriptionUpsert(sub: Stripe.Subscription): Promise<void> {
    const plan = this.resolvePlan(sub);
    const status = this.resolveStatus(sub.status);
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

    // In Stripe SDK v20 (API 2026-02-25.clover), period dates moved to SubscriptionItem.
    const firstItem = sub.items.data[0];
    const periodStart = firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1000)
      : new Date();
    const periodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : new Date();

    await this.subscriptionService.syncFromStripe({
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      plan,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });

    this.logger.log(
      `Subscription synced: subId=${sub.id} plan=${plan} status=${status} ` +
      `cancelAtPeriodEnd=${sub.cancel_at_period_end}`,
    );
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    await this.subscriptionService.markCanceled(customerId);
    this.logger.log(`Subscription canceled: subId=${sub.id} customerId=${customerId}`);
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // In Stripe SDK v20, subscription reference lives in invoice.parent.
    const subId = invoice.parent?.subscription_details?.subscription
      ? (typeof invoice.parent.subscription_details.subscription === 'string'
          ? invoice.parent.subscription_details.subscription
          : invoice.parent.subscription_details.subscription.id)
      : null;
    if (!subId) return;

    const stripeSub = await this.stripe.subscriptions.retrieve(subId);
    await this.handleSubscriptionUpsert(stripeSub);
    this.logger.log(`Payment succeeded, subscription re-synced: subId=${subId}`);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = typeof invoice.customer === 'string'
      ? invoice.customer
      : (invoice.customer as Stripe.Customer | Stripe.DeletedCustomer | null)?.id ?? '';
    if (!customerId) return;

    // Fetch latest subscription state and sync it — Stripe will have set
    // status to 'past_due' by this point.
    const subs = await this.stripe.subscriptions.list({ customer: customerId, limit: 1 });
    if (subs.data.length > 0) {
      await this.handleSubscriptionUpsert(subs.data[0]);
    }
    this.logger.warn(`Payment failed for customer: customerId=${customerId}`);
  }

  // ── Plan / status resolution ──────────────────────────────────────────────

  // Resolves the SubscriptionPlan from the Stripe subscription's price IDs.
  // Falls back to STARTER if the price is not in our map (e.g., legacy price).
  private resolvePlan(sub: Stripe.Subscription): SubscriptionPlan {
    const priceId = sub.items.data[0]?.price?.id;
    if (priceId && this.priceToplan.has(priceId)) {
      return this.priceToplan.get(priceId)!;
    }
    this.logger.warn(
      `Unknown price ID '${priceId ?? 'none'}' in subscription ${sub.id}. Defaulting to STARTER.`,
    );
    return SubscriptionPlan.STARTER;
  }

  // Maps Stripe's subscription status strings to our SubscriptionStatus enum.
  private resolveStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':      return SubscriptionStatus.ACTIVE;
      case 'trialing':    return SubscriptionStatus.TRIALING;
      case 'past_due':    return SubscriptionStatus.PAST_DUE;
      case 'canceled':    return SubscriptionStatus.CANCELED;
      case 'unpaid':      return SubscriptionStatus.PAST_DUE;  // treat unpaid as past_due
      case 'incomplete':
      case 'incomplete_expired':
      case 'paused':
      default:
        return SubscriptionStatus.PAST_DUE;
    }
  }
}
