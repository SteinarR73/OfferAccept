import { IsString, IsArray, ArrayMinSize, IsBoolean, IsOptional } from 'class-validator';
import { WebhookEvent } from '../webhook.service';
import { IsWebhookUrl } from '../webhook-url.validator';

export class UpdateWebhookDto {
  @IsOptional()
  @IsWebhookUrl()
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events?: WebhookEvent[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
