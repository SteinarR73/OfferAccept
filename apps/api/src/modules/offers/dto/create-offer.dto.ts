import {
  IsString,
  IsOptional,
  MaxLength,
  IsISO8601,
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsFutureDate } from '../../../common/validators/is-future-date.validator';

class RecipientDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(200)
  name!: string;
}

export class CreateOfferDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  message?: string;

  @IsOptional()
  @IsISO8601()
  @IsFutureDate()
  expiresAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientDto)
  recipient?: RecipientDto;
}
