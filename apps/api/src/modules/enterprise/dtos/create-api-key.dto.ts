import { IsString, IsNotEmpty, MaxLength, IsOptional, IsDateString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
