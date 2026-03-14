import { IsString, IsOptional, MaxLength, IsISO8601 } from 'class-validator';

export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  message?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
