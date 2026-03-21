import { IsString, IsNotEmpty } from 'class-validator';

// ─── DeclineOfferDto ────────────────────────────────────────────────────────
// Decline requires a challengeId so the session is resolved from the challenge's
// bound sessionId — not from a "latest resumable" lookup.
//
// The challenge does NOT need to be VERIFIED to decline.
// The challenge must exist and belong to the token's recipient so the flow can
// identify the correct session. This prevents multi-tab ambiguity.

export class DeclineOfferDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;
}
