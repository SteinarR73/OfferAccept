import * as crypto from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, User, EmailVerificationToken, PasswordResetToken } from '@prisma/client';

// ─── AuthRepository ────────────────────────────────────────────────────────────
// All DB queries for the auth domain. Keeps auth.service.ts free of Prisma details.
//
// Token security model (applies to both EmailVerificationToken and PasswordResetToken):
//   rawToken  = crypto.randomBytes(32).toString('base64url')   [256 bits of entropy]
//   tokenHash = SHA-256(rawToken) — only the hash is stored
//
// Token TTLs:
//   email verification: 24 hours
//   password reset:      1 hour
//
// Single-use enforcement: usedAt is set atomically in the same DB write that
// advances the dependent state (emailVerified=true / hashedPassword=newHash).
// A second call with the same token returns null from findValidXxxToken() because
// usedAt IS NOT NULL.

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;       // 1 hour

@Injectable()
export class AuthRepository {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // ── User ──────────────────────────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<User | null> {
    return this.db.user.findFirst({ where: { email, deletedAt: null } });
  }

  async findUserById(userId: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id: userId, deletedAt: null } });
  }

  // Creates an org + owner user + OWNER Membership atomically.
  // Caller is responsible for checking for duplicate email before calling —
  // the unique constraint is the final guard.
  async createOrgAndOwner(params: {
    orgName: string;
    orgSlug: string;
    userName: string;
    email: string;
    hashedPassword: string;
  }): Promise<User> {
    return this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: params.orgName, slug: params.orgSlug },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          name: params.userName,
          email: params.email,
          hashedPassword: params.hashedPassword,
          role: 'OWNER',
          emailVerified: false,
        },
      });

      // Seed the Membership table so the multi-org system is consistent from day 1.
      await tx.membership.create({
        data: { userId: user.id, organizationId: org.id, role: 'OWNER' },
      });

      return user;
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { hashedPassword },
    });
  }

  // ── Email verification tokens ─────────────────────────────────────────────────

  // Generates a raw token, stores its hash, returns the raw token for delivery.
  async createEmailVerificationToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);

    // Invalidate any prior unused tokens for this user before creating a new one.
    await this.db.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.db.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  // Returns the token row if valid (not used, not expired), null otherwise.
  async findValidEmailVerificationToken(rawToken: string): Promise<EmailVerificationToken | null> {
    const tokenHash = sha256(rawToken);
    const token = await this.db.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!token) return null;
    if (token.usedAt) return null;
    if (token.expiresAt <= new Date()) return null;

    return token;
  }

  // Atomically consume the token and mark the user's email as verified.
  async consumeEmailVerificationToken(tokenId: string, userId: string): Promise<void> {
    await this.db.$transaction([
      this.db.emailVerificationToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date() },
      }),
      this.db.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      }),
    ]);
  }

  // ── Password reset tokens ──────────────────────────────────────────────────────

  async createPasswordResetToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    // Invalidate any prior unused tokens for this user.
    await this.db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.db.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return rawToken;
  }

  // Returns the token row if valid (not used, not expired), null otherwise.
  async findValidPasswordResetToken(rawToken: string): Promise<PasswordResetToken | null> {
    const tokenHash = sha256(rawToken);
    const token = await this.db.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!token) return null;
    if (token.usedAt) return null;
    if (token.expiresAt <= new Date()) return null;

    return token;
  }

  // Atomically consume the token and update the user's hashed password.
  async consumePasswordResetToken(
    tokenId: string,
    userId: string,
    newHashedPassword: string,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.passwordResetToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date() },
      }),
      this.db.user.update({
        where: { id: userId },
        data: { hashedPassword: newHashedPassword },
      }),
    ]);
  }
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
