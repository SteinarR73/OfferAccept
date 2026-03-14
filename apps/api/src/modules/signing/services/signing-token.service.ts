import * as crypto from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { OfferRecipient } from '@offeracept/database';
import { TokenInvalidError } from '../../../common/errors/domain.errors';

// Raw token format: oa_<base64url(32 bytes)>
// 256 bits of entropy from crypto.randomBytes.
// The raw token is returned ONCE for embedding in the email link.
// Only the SHA-256 hash is persisted.

export interface GeneratedToken {
  rawToken: string;
  tokenHash: string;
  tokenExpiresAt: Date;
}

@Injectable()
export class SigningTokenService {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // Generate a new token. rawToken must be used immediately (e.g. embedded in email)
  // and must never be logged or persisted.
  generateToken(expiresAt: Date): GeneratedToken {
    const rawBytes = crypto.randomBytes(32);
    const rawToken = 'oa_' + rawBytes.toString('base64url');
    const tokenHash = this.hash(rawToken);
    return { rawToken, tokenHash, tokenExpiresAt: expiresAt };
  }

  hash(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  // Looks up the recipient for a raw token.
  // Throws TokenInvalidError on any failure — not found, expired, or revoked —
  // so the error message and HTTP response are identical regardless of the reason.
  // This prevents enumeration of valid vs invalid tokens.
  async verifyToken(rawToken: string): Promise<OfferRecipient> {
    // Basic format check — avoids a DB query for obviously invalid inputs
    if (!rawToken.startsWith('oa_') || rawToken.length < 10) {
      // Introduce a small constant-time delay before throwing, so a too-short token
      // cannot be distinguished from a not-found token by response timing.
      await constantDelay();
      throw new TokenInvalidError();
    }

    const tokenHash = this.hash(rawToken);

    const recipient = await this.db.offerRecipient.findFirst({
      where: {
        tokenHash,
        tokenExpiresAt: { gt: new Date() },
        tokenInvalidatedAt: null,
      },
      include: { offer: true },
    });

    if (!recipient) {
      // Constant-time delay: prevent distinguishing "not found" from "expired"
      // by comparing response times. The delay is short enough to not affect UX.
      await constantDelay();
      throw new TokenInvalidError();
    }

    return recipient;
  }
}

// 2–5 ms synthetic delay — short enough to be invisible to users,
// long enough to defeat coarse timing attacks.
function constantDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 2 + Math.random() * 3));
}
