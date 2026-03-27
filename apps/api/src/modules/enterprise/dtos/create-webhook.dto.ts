import { IsString, IsArray, ArrayMinSize } from 'class-validator';
import { WebhookEvent } from '../webhook.service';
import { IsWebhookUrl } from '../webhook-url.validator';

export class CreateWebhookDto {
  // @IsWebhookUrl replaces @IsUrl({ protocols:['https'], require_tld:true }).
  // It additionally blocks IP address literals and bare hostnames that
  // class-validator's IsUrl accepts (SSRF protection, Stage 1 — syntactic).
  @IsWebhookUrl()
  url!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events!: WebhookEvent[];
}
