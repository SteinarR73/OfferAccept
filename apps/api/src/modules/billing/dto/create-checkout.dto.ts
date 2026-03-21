import { IsString, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  priceId!: string;

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
