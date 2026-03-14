import { IsEmail, IsString, MaxLength } from 'class-validator';

export class SetRecipientDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(200)
  name: string;
}
