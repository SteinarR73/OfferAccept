import * as crypto from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, Session } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { SessionRevokedError } from '../../common/errors/domain.errors';

// ─── SessionService ────────────────────────────────────────────────────────────
// Manages refresh-token sessions in the database.
//
// Refresh tokens are NOT JWTs — they are:
//   rawToken = crypto.randomBytes(32).toString('base64url')   [256 bits of entropy]
//   stored as SHA-256(rawToken) in Session.refreshTokenHash
//   delivered as an HttpOnly cookie named "refreshToken"
//
// Rotation on every use:
//   - The current session is revoked (revokedAt set)
//   - A new session is created with a new rawToken
//   - Both steps happen atomically inside a $transaction
//
// The revoked row is intentionally kept for audit purposes.

const HASH_ALGO = 'sha256';

@Injectable()
export class SessionService {
  private readonly refreshTtlDays: number;

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly config: ConfigService,
  ) {
    this.refreshTtlDays = this.config.get<number>('JWT_REFRESH_TTL_DAYS', 30);
  }

  // Issue a fresh refresh token and persist the session.
  // Returns the raw token for delivery in the cookie — caller must not log it.
  async create(
    userId: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ rawToken: string; session: Session }> {
    const { rawToken, tokenHash } = this.generateToken();
    const expiresAt = this.expiryDate();

    const session = await this.db.session.create({
      data: {
        userId,
        refreshTokenHash: tokenHash,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        expiresAt,
      },
    });

    return { rawToken, session };
  }

  // Rotate: revoke the current session, issue a new one.
  // Returns the new raw token for delivery in the cookie — caller must not log it.
  async rotate(
    sessionId: string,
    userId: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ rawToken: string; session: Session }> {
    const { rawToken, tokenHash } = this.generateToken();
    const expiresAt = this.expiryDate();

    const [, newSession] = await this.db.$transaction([
      this.db.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      }),
      this.db.session.create({
        data: {
          userId,
          refreshTokenHash: tokenHash,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          expiresAt,
        },
      }),
    ]);

    return { rawToken, session: newSession };
  }

  // Look up an active session by raw refresh token.
  // Returns null if the token hash is not found (not found = same response as expired/revoked).
  // Throws SessionRevokedError if found but revoked.
  // Returns null if found but expired.
  async findByRawToken(rawToken: string): Promise<Session | null> {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.db.session.findUnique({ where: { refreshTokenHash: tokenHash } });
    if (!session) return null;

    if (session.revokedAt) {
      // Token was explicitly revoked (logout or previous rotation). This could indicate
      // a refresh token replay attack — treat as revocation, not a silent null.
      throw new SessionRevokedError();
    }

    if (session.expiresAt <= new Date()) return null;

    return session;
  }

  // Revoke a single session by ID (used on logout).
  async revoke(sessionId: string): Promise<void> {
    await this.db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  // Revoke all active sessions for a user (password change / security wipe).
  async revokeAll(userId: string): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private generateToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash(HASH_ALGO).update(rawToken, 'utf8').digest('hex');
  }

  private expiryDate(): Date {
    const d = new Date();
    d.setDate(d.getDate() + this.refreshTtlDays);
    return d;
  }
}
