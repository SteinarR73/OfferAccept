import { IsString, IsUrl, IsArray, ArrayMinSize } from 'class-validator';
import { WebhookEvent } from '../webhook.service';

export class CreateWebhookDto {
  @IsUrl({ protocols: ['https'], require_tld: true })
  url!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events!: WebhookEvent[];
}
