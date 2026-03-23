import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  RawBodyRequest,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { BillingService } from './billing.service';
import { SubscriptionService } from './subscription.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import type { Env } from '../../config/env';

// ─── BillingController ─────────────────────────────────────────────────────────
//
// Routes:
//   POST /billing/checkout   (JWT) — create Stripe Checkout session, return URL
//   GET  /billing/portal     (JWT) — create Stripe Customer Portal session, return URL
//   GET  /billing/subscription (JWT) — return current subscription state
//   POST /billing/webhook    (none) — Stripe webhook, signature-verified
//
// The webhook endpoint is intentionally NOT guarded by JwtAuthGuard.
// Security is provided by Stripe's HMAC-SHA256 signature over the raw body.
// rawBody is enabled in main.ts (rawBody: true in NestFactory.create options).

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptionService: SubscriptionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ── POST /billing/checkout ─────────────────────────────────────────────────
  // Creates a Stripe Checkout session and returns the hosted URL.
  // The client should redirect to this URL immediately.

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ url: string }> {
    const webBase = this.config.get('WEB_BASE_URL', { infer: true });

    // Resolve plan → Stripe price ID on the server. The client supplies only a
    // symbolic plan name; it never controls which Stripe price is charged.
    const priceEnvKey = `STRIPE_PRICE_${dto.plan}` as
      | 'STRIPE_PRICE_STARTER'
      | 'STRIPE_PRICE_PROFESSIONAL'
      | 'STRIPE_PRICE_ENTERPRISE';
    const priceId = this.config.get(priceEnvKey, { infer: true });

    if (!priceId) {
      // Should not happen — env.ts enforces all STRIPE_PRICE_* when BILLING_PROVIDER=stripe.
      throw new BadRequestException(`No Stripe price configured for plan: ${dto.plan}`);
    }

    // Validate that client-supplied redirect URLs, if provided, start with WEB_BASE_URL.
    // Prevents open redirect via a forged Stripe checkout completion URL.
    if (dto.successUrl && !dto.successUrl.startsWith(webBase)) {
      throw new BadRequestException('successUrl must begin with the application base URL.');
    }
    if (dto.cancelUrl && !dto.cancelUrl.startsWith(webBase)) {
      throw new BadRequestException('cancelUrl must begin with the application base URL.');
    }

    const successUrl =
      dto.successUrl ?? `${webBase}/dashboard/settings/billing?success=1`;
    const cancelUrl =
      dto.cancelUrl ?? `${webBase}/dashboard/settings/billing?canceled=1`;

    const url = await this.billingService.createCheckoutSession(
      user.orgId,
      user.sub,
      priceId,
      successUrl,
      cancelUrl,
    );

    return { url };
  }

  // ── GET /billing/portal ────────────────────────────────────────────────────
  // Creates a Stripe Customer Portal session and returns the URL.
  // The client redirects to this URL for self-service plan management.

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  async getPortalUrl(@CurrentUser() user: JwtPayload): Promise<{ url: string }> {
    const webBase = this.config.get('WEB_BASE_URL', { infer: true });
    const returnUrl = `${webBase}/dashboard/settings/billing`;

    const url = await this.billingService.createPortalSession(user.orgId, returnUrl);

    return { url };
  }

  // ── GET /billing/subscription ──────────────────────────────────────────────
  // Returns the organisation's current subscription state for the dashboard.

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  async getSubscription(@CurrentUser() user: JwtPayload): Promise<SubscriptionResponse> {
    const sub = await this.subscriptionService.getSubscription(user.orgId);

    if (!sub) {
      // No subscription row — return FREE defaults.
      return {
        plan: 'FREE',
        status: 'TRIALING',
        cancelAtPeriodEnd: false,
        monthlyOfferCount: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      };
    }

    return {
      plan: sub.plan,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      monthlyOfferCount: sub.monthlyOfferCount,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  // ── POST /billing/sync ─────────────────────────────────────────────────────
  // Re-fetches subscription state from Stripe and syncs it to the database.
  // Intended for recovery after missed webhooks or for support tooling.
  // Returns 204 No Content on success.

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async syncFromStripe(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.billingService.resyncFromStripe(user.orgId);
  }

  // ── POST /billing/webhook ──────────────────────────────────────────────────
  // Receives and processes Stripe webhook events.
  //
  // Security: Stripe HMAC-SHA256 signature verified via constructEvent().
  // This endpoint must NOT be behind JwtAuthGuard.
  // rawBody must be enabled in main.ts for signature verification to work.
  //
  // Returns 200 for:
  //   - Successfully processed events
  //   - Known but unhandled event types (prevents Stripe from retrying)
  // Returns 400 for:
  //   - Missing stripe-signature header
  //   - Failed signature verification

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    if (!signature) {
      this.logger.warn('Stripe webhook received without stripe-signature header');
      throw new BadRequestException('Missing stripe-signature header.');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('rawBody is undefined — ensure rawBody: true in NestFactory.create()');
      throw new BadRequestException('Request body unavailable.');
    }

    try {
      await this.billingService.handleWebhookEvent(rawBody, signature);
    } catch (err) {
      // constructEvent() throws on bad signature; surface it as 400.
      throw new BadRequestException(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ── Response shape ─────────────────────────────────────────────────────────────

interface SubscriptionResponse {
  plan: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  monthlyOfferCount: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}
