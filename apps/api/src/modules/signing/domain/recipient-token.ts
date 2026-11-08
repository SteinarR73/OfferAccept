import * as crypto from 'crypto';

// Raw token format: oa_<base64url(32 bytes)> — 256 bits of entropy.
// The raw token is returned ONCE for embedding in the email link and must never
// be logged or persisted. Only the SHA-256 hash is stored.

export const RECIPIENT_TOKEN_PREFIX = 'oa_';

export interface GeneratedRecipientToken {
  rawToken: string;
  tokenHash: string;
  tokenExpiresAt: Date;
}

export function hashRecipientToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateRecipientToken(expiresAt: Date): GeneratedRecipientToken {
  const rawToken = RECIPIENT_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashRecipientToken(rawToken), tokenExpiresAt: expiresAt };
}
