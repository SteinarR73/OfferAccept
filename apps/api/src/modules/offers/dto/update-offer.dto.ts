import { IsString, IsOptional, MaxLength, IsISO8601 } from 'class-validator';
import { IsFutureDate } from '../../../common/validators/is-future-date.validator';

export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  message?: string;

  @IsOptional()
  @IsISO8601()
  @IsFutureDate()
  expiresAt?: string;
}
