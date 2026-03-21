import { IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 numeric digits' })
  code!: string;
}
