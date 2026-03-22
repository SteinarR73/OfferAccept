import { IsString, IsUrl, IsArray, ArrayMinSize, IsBoolean, IsOptional } from 'class-validator';
import { WebhookEvent } from '../webhook.service';

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_tld: true })
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
