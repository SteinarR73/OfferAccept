import { IsString, IsNotEmpty } from 'class-validator';

// ─── DeclineOfferDto ────────────────────────────────────────────────────────
// challengeId is required and must belong to a VERIFIED OTP challenge: declining
// carries the same email-verification assurance as accepting (the session state
// machine only allows OTP_VERIFIED → DECLINED), so nobody who merely holds the
// signing link can decline on the recipient's behalf.
//
// The session is resolved from the challenge's bound sessionId, which also removes
// multi-tab ambiguity.

export class DeclineOfferDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;
}
