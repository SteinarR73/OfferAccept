import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

// ─── DeclineOfferDto ────────────────────────────────────────────────────────
// challengeId is optional. When provided the session is resolved via the
// challenge's bound sessionId (preferred — eliminates multi-tab ambiguity).
// When absent the session is resolved via findResumable() (fallback — used when
// the recipient declines before requesting an OTP and therefore has no challengeId).
//
// The challenge does NOT need to be VERIFIED to decline.

export class DeclineOfferDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  challengeId?: string;
}
