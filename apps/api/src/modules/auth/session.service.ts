import * as crypto from 'crypto';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient, Session } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { SessionRevokedError } from '../../common/errors/domain.errors';

// ─── SessionService ────────────────────────────────────────────────────────────
// Manages refresh-token sessions in the database.
//
// Refresh tokens are NOT JWTs — they are:
//   rawToken  = crypto.randomBytes(32).toString('base64url')  [256 bits of entropy]
//   stored as SHA-256(rawToken) in Session.refreshTokenHash
//   delivered as an HttpOnly, SameSite=Strict cookie named "refreshToken"
//   scoped to Path=/api/v1/auth/refresh (never sent outside the refresh endpoint)
//
// ── Rotation on every use ──────────────────────────────────────────────────────
// Each call to rotate() atomically:
//   1. Sets revokedAt on the current session (marks it consumed)
//   2. Creates a new session with a fresh token and the same familyId
// The revoked row is kept for audit purposes and replay detection.
//
// ── Token family tracking ──────────────────────────────────────────────────────
// Every login creates a root session with a fresh random familyId.
// Every rotation propagates familyId to the child session.
// familyId links all tokens ever issued from the same root login.
//
// If a revoked token is presented (replay / theft detected):
//   - All active sessions in the same family are revoked immediately.
//   - The attacker's token is useless; the legitimate holder is forced to re-login.
//   - A structured warning is logged with userId and familyId for incident response.
//
// Sessions created before this migration have familyId = null.
// Legacy sessions are grandfathered: replay detection skips family revocation
// (cannot do it without familyId), and the first successful rotation creates a
// fresh family so protection applies going forward.

const HASH_ALGO = 'sha256';
const FAMILY_ID_BYTES = 16; // 128-bit random family identifier

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly refreshTtlDays: number;

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly config: ConfigService,
  ) {
    this.refreshTtlDays = this.config.get<number>('JWT_REFRESH_TTL_DAYS', 30);
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  // Issues a fresh refresh token and creates a root session.
  // Returns the raw token for delivery in the cookie — never log the raw token.
  async create(
    userId: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ rawToken: string; session: Session }> {
    const { rawToken, tokenHash } = this.generateToken();
    const expiresAt = this.expiryDate();
    // Every new login starts a fresh token family.
    const familyId = crypto.randomBytes(FAMILY_ID_BYTES).toString('hex');

    const session = await this.db.session.create({
      data: {
        userId,
        refreshTokenHash: tokenHash,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        expiresAt,
        familyId,
      },
    });

    return { rawToken, session };
  }

  // ── Rotate ─────────────────────────────────────────────────────────────────
  // Atomically revokes the current session and issues a child session in the
  // same token family. The family chain is maintained so a replay of any earlier
  // token in the chain triggers whole-family revocation.
  //
  // inheritedFamilyId: the familyId from the session being rotated.
  // Null for legacy sessions (created before the migration) — a new family root
  // is created so protection applies to all subsequent rotations.
  async rotate(
    sessionId: string,
    userId: string,
    inheritedFamilyId: string | null | undefined,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ rawToken: string; session: Session }> {
    const { rawToken, tokenHash } = this.generateToken();
    const expiresAt = this.expiryDate();
    // Propagate family; generate a fresh root for legacy sessions.
    const familyId = inheritedFamilyId ?? crypto.randomBytes(FAMILY_ID_BYTES).toString('hex');

    const [, newSession] = await this.db.$transaction([
      // Mark the old session consumed — this is what triggers family revocation
      // if the old token is ever replayed.
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
          familyId,
        },
      }),
    ]);

    return { rawToken, session: newSession };
  }

  // ── FindByRawToken ──────────────────────────────────────────────────────────
  // Looks up an active session by raw refresh token.
  //
  // Returns null:  token not found, or token has expired.
  //               (same response for both — prevents token enumeration)
  //
  // Throws SessionRevokedError:
  //   Token was found but is revoked (logout or rotation already consumed it).
  //   This is the replay-detection path. If the session has a familyId, ALL
  //   active sessions in the family are revoked before throwing — this protects
  //   against token theft where the attacker attempts to refresh a stolen token
  //   after the legitimate holder has already rotated it.
  async findByRawToken(rawToken: string): Promise<Session | null> {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.db.session.findUnique({ where: { refreshTokenHash: tokenHash } });
    if (!session) return null;

    if (session.revokedAt) {
      // ── REPLAY ATTACK DETECTED ───────────────────────────────────────────────
      // A previously-consumed token was presented. Either the legitimate user is
      // replaying a stale cookie (e.g., using browser back-button) or a stolen
      // token is being used after the legitimate holder already rotated.
      //
      // Family revocation: revoke all active tokens in the same family.
      // This forces both parties to re-authenticate. Worst case (false positive):
      // the legitimate user must log in again. Best case: we cut off an attacker
      // immediately.
      if (session.familyId) {
        const { count } = await this.revokeFamily(session.familyId);
        this.logger.warn(
          {
            event:    'refresh_token_replay',
            userId:   session.userId,
            sessionId: session.id,
            familyId: session.familyId,
            revokedCount: count,
          },
          `[SessionService] Refresh token replay detected for user=${session.userId}. ` +
          `Revoked ${count} family session(s). familyId=${session.familyId}.`,
        );
      }
      throw new SessionRevokedError();
    }

    if (session.expiresAt <= new Date()) return null;

    return session;
  }

  // ── Revoke ─────────────────────────────────────────────────────────────────
  // Revokes a single session by ID (logout).
  async revoke(sessionId: string): Promise<void> {
    await this.db.session.update({
      where: { id: sessionId },
      data:  { revokedAt: new Date() },
    });
  }

  // ── RevokeAll ───────────────────────────────────────────────────────────────
  // Revokes all active sessions for a user (password change / security wipe).
  async revokeAll(userId: string): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
  }

  // ── RevokeFamily ────────────────────────────────────────────────────────────
  // Revokes all active sessions belonging to the given token family.
  // Called on replay detection; also available for security incident response.
  // Returns the number of sessions revoked.
  async revokeFamily(familyId: string): Promise<{ count: number }> {
    const result = await this.db.session.updateMany({
      where: { familyId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
    return { count: result.count };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

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
