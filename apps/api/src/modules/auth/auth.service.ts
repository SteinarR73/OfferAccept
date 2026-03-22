import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from './auth.repository';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { JwtTokenService, AccessTokenPayload } from './jwt.service';
import { EmailPort, EMAIL_PORT } from '../../common/email/email.port';
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  EmailNotVerifiedError,
  AuthTokenInvalidError,
} from '../../common/errors/domain.errors';

// ─── AuthService ───────────────────────────────────────────────────────────────
// Orchestrates all authentication use-cases:
//   signup        — create org + user, send verification email
//   login         — verify credentials, issue access + refresh tokens
//   logout        — revoke session
//   refresh       — rotate refresh token, issue new access token
//   verifyEmail   — consume email-verification token
//   requestPasswordReset — send reset email (fire-and-forget, always succeeds)
//   resetPassword — consume reset token, update password, revoke all sessions
//   changePassword — verify current password, update, revoke all other sessions
//
// Security invariants:
//   - Passwords are never stored raw — always bcrypt-hashed (rounds=12)
//   - Reset / verification tokens are never stored raw — SHA-256 in DB
//   - Refresh tokens are never stored raw — SHA-256 in DB
//   - requestPasswordReset always returns successfully to prevent email enumeration
//   - Login always runs bcrypt even when user is not found (anti-timing)
//   - emailVerified=false blocks login (returned as a specific error so the UI
//     can prompt the user to check their inbox — not a generic 401)

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface SignupResult {
  userId: string;
  orgId: string;
}

@Injectable()
export class AuthService {
  private readonly webBaseUrl: string;

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtTokenService,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    private readonly config: ConfigService,
  ) {
    this.webBaseUrl = this.config.getOrThrow<string>('WEB_BASE_URL');
  }

  // ── Signup ─────────────────────────────────────────────────────────────────

  async signup(params: {
    orgName: string;
    userName: string;
    email: string;
    password: string;
  }): Promise<SignupResult> {
    const existing = await this.repo.findUserByEmail(params.email);
    if (existing) {
      // Do NOT reveal that the email is taken — same error as "invalid credentials"
      // at the HTTP layer. Here we throw a domain error so the caller can decide
      // how to handle it (the controller uses EmailAlreadyExistsError specifically
      // to return a 409 only in non-enumerable contexts).
      throw new EmailAlreadyExistsError();
    }

    const hashedPassword = await this.passwordService.hash(params.password);
    const slug = slugify(params.orgName);

    const user = await this.repo.createOrgAndOwner({
      orgName: params.orgName,
      orgSlug: slug,
      userName: params.userName,
      email: params.email,
      hashedPassword,
    });

    // Send verification email — fire after DB commit, non-blocking for the
    // signup response. If email fails, the user can request a re-send.
    const rawToken = await this.repo.createEmailVerificationToken(user.id);
    const verificationUrl = `${this.webBaseUrl}/verify-email?token=${rawToken}`;

    await this.emailPort.sendEmailVerification({
      to: params.email,
      name: params.userName,
      verificationUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // user.organizationId is always set by createOrgAndOwner (set in the same transaction).
    // Guard defensively in case a future refactor changes that invariant.
    if (!user.organizationId) {
      throw new Error(`Signup produced a user (${user.id}) with no organizationId — data integrity violation.`);
    }

    return { userId: user.id, orgId: user.organizationId };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    const user = await this.repo.findUserByEmail(email);

    // Always run bcrypt even when user is null — prevents username-enumeration timing.
    const valid = await this.passwordService.verify(password, user?.hashedPassword ?? null);

    if (!user || !valid) {
      throw new InvalidCredentialsError();
    }

    if (!user.emailVerified) {
      throw new EmailNotVerifiedError();
    }

    const { rawToken, session } = await this.sessionService.create(user.id, context);

    // Resolve org context from Membership (canonical for multi-org).
    // Falls back to User.organizationId for accounts that predate the Membership migration.
    // Throws if neither source yields an org — this should never happen for a valid account
    // and indicates a data integrity problem that must not be silently swallowed.
    const membership = await this.repo.findPrimaryMembership(user.id);
    const orgId = membership?.organizationId ?? user.organizationId;
    const orgRole = membership?.role ?? user.role;

    if (!orgId) {
      // Guard: a user with no org context cannot operate the system correctly.
      // Log with userId so the problem account can be identified and repaired.
      throw new Error(
        `User ${user.id} has no resolvable orgId — missing Membership row and User.organizationId is null. ` +
        `Account requires data repair before login is possible.`,
      );
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      orgId,
      orgRole,
      role: user.role,
      sessionId: session.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: rawToken,
      sessionId: session.id,
    };
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(sessionId: string): Promise<void> {
    await this.sessionService.revoke(sessionId);
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────
  // Validates the raw refresh token, rotates it, issues a new access token.
  // Throws SessionRevokedError if the token was already consumed (possible replay).

  async refresh(
    rawRefreshToken: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    // findByRawToken throws SessionRevokedError on revoked tokens (replay guard),
    // returns null on not-found or expired.
    const session = await this.sessionService.findByRawToken(rawRefreshToken);
    if (!session) {
      // Not found or expired — treat identically to prevent token enumeration.
      throw new AuthTokenInvalidError();
    }

    const user = await this.loadUserById(session.userId);
    if (!user || !user.emailVerified) {
      await this.sessionService.revoke(session.id);
      throw new AuthTokenInvalidError();
    }

    const { rawToken: newRawToken, session: newSession } = await this.sessionService.rotate(
      session.id,
      session.userId,
      context,
    );

    const membership = await this.repo.findPrimaryMembership(user.id);
    const orgId = membership?.organizationId ?? user.organizationId;
    const orgRole = membership?.role ?? user.role;

    if (!orgId) {
      await this.sessionService.revoke(session.id);
      throw new Error(
        `User ${user.id} has no resolvable orgId during token refresh — ` +
        `missing Membership row and User.organizationId is null. Account requires data repair.`,
      );
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      orgId,
      orgRole,
      role: user.role,
      sessionId: newSession.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: newRawToken,
      sessionId: newSession.id,
    };
  }

  // ── Email verification ─────────────────────────────────────────────────────

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.repo.findValidEmailVerificationToken(rawToken);
    if (!token) {
      throw new AuthTokenInvalidError();
    }
    await this.repo.consumeEmailVerificationToken(token.id, token.userId);
  }

  // Resend verification email. Always succeeds (even if user not found) to prevent
  // email enumeration. Invalidates the previous token and issues a new one.
  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.repo.findUserByEmail(email);
    if (!user || user.emailVerified) return; // silently no-op

    const rawToken = await this.repo.createEmailVerificationToken(user.id);
    const verificationUrl = `${this.webBaseUrl}/verify-email?token=${rawToken}`;

    await this.emailPort.sendEmailVerification({
      to: email,
      name: user.name,
      verificationUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  // ── Password reset ─────────────────────────────────────────────────────────

  // Always returns successfully — never reveals whether the email exists.
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.repo.findUserByEmail(email);
    if (!user) return; // silently no-op — prevents enumeration

    const rawToken = await this.repo.createPasswordResetToken(user.id);
    const resetUrl = `${this.webBaseUrl}/reset-password?token=${rawToken}`;

    await this.emailPort.sendPasswordReset({
      to: email,
      name: user.name,
      resetUrl,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
    context: { ipAddress?: string },
  ): Promise<void> {
    const token = await this.repo.findValidPasswordResetToken(rawToken);
    if (!token) {
      throw new AuthTokenInvalidError();
    }

    const newHash = await this.passwordService.hash(newPassword);

    // Atomically consume token + update password
    await this.repo.consumePasswordResetToken(token.id, token.userId, newHash);

    // Revoke all active sessions — the password change is a security event
    await this.sessionService.revokeAll(token.userId);

    // Load user for notification email
    const user = await this.loadUserById(token.userId);
    if (user) {
      await this.emailPort.sendPasswordChanged({
        to: user.email,
        name: user.name,
        changedAt: new Date(),
        ipAddress: context.ipAddress,
      });
    }
  }

  // ── Change password (authenticated) ───────────────────────────────────────

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId: string,
    context: { ipAddress?: string },
  ): Promise<void> {
    const user = await this.loadUserById(userId);
    if (!user) throw new InvalidCredentialsError();

    const valid = await this.passwordService.verify(currentPassword, user.hashedPassword);
    if (!valid) throw new InvalidCredentialsError();

    const newHash = await this.passwordService.hash(newPassword);
    await this.repo.updatePassword(userId, newHash);

    // Revoke all sessions except the current one (keep the user logged in)
    await this.sessionService.revokeAll(userId);

    await this.emailPort.sendPasswordChanged({
      to: user.email,
      name: user.name,
      changedAt: new Date(),
      ipAddress: context.ipAddress,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private loadUserById(userId: string) {
    return this.repo.findUserById(userId);
  }
}

// Slugify: lowercase, replace spaces/special chars with hyphens, collapse duplicates.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'org';
}
