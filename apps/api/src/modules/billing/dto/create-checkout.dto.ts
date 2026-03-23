import { IsIn, IsUrl, IsOptional } from 'class-validator';

// Plan names accepted from the client. The server resolves these to Stripe price IDs
// using env vars — clients never supply raw price IDs directly.
export const CHECKOUT_PLAN_VALUES = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export type CheckoutPlan = (typeof CHECKOUT_PLAN_VALUES)[number];

export class CreateCheckoutDto {
  // Accept only the symbolic plan name — never a raw Stripe price ID.
  // The controller maps plan → priceId using server-controlled env config.
  @IsIn(CHECKOUT_PLAN_VALUES, {
    message: `plan must be one of: ${CHECKOUT_PLAN_VALUES.join(', ')}`,
  })
  plan!: CheckoutPlan;

  // Where Stripe redirects after a successful payment.
  // Defaults to {WEB_BASE_URL}/dashboard/settings/billing?success=1 if omitted.
  @IsUrl({ require_tld: false })
  @IsOptional()
  successUrl?: string;

  // Where Stripe redirects if the customer cancels checkout.
  // Defaults to {WEB_BASE_URL}/dashboard/settings/billing?canceled=1 if omitted.
  @IsUrl({ require_tld: false })
  @IsOptional()
  cancelUrl?: string;
}
