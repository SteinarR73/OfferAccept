import { IsString, IsOptional, MaxLength } from 'class-validator';

export class AcceptOfferDto {
  @IsString()
  challengeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  locale?: string; // e.g. "en-GB"

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string; // IANA timezone e.g. "Europe/London"
}
