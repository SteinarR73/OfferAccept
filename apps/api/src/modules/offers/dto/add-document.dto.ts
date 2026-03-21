import { IsString, MaxLength, IsInt, Min, Matches } from 'class-validator';

export class AddDocumentDto {
  @IsString()
  @MaxLength(500)
  filename!: string;

  // Object storage key — validated to be non-empty path segment
  @IsString()
  @MaxLength(1000)
  storageKey!: string;

  @IsString()
  @MaxLength(200)
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  // SHA-256 hex digest — must be exactly 64 lowercase hex characters
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'sha256Hash must be a valid SHA-256 hex digest' })
  sha256Hash!: string;
}
