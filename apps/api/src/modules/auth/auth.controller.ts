import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { IsEmail, IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';
import { LoginLockoutService } from './login-lockout.service';
import { InvalidCredentialsError, EmailNotVerifiedError } from '../../common/errors/domain.errors';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { extractClientIp } from '../../common/proxy/trusted-proxy.util';
import type { Env } from '../../config/env';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class SignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  orgName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  // Version of the Terms of Service accepted at signup (e.g. "1.1").
  // Required — accounts cannot be created without explicit ToS acceptance.
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  termsVersion!: string;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

class ResendVerificationDto {
  @IsEmail()
  email!: string;
}

// ─── AuthController ───────────────────────────────────────────────────────────
// All routes under /api/v1/auth.
//
// Token delivery:
//   - accessToken : HttpOnly, SameSite=Strict, Secure (prod), Path=/
//   - refreshToken: HttpOnly, SameSite=Strict, Secure (prod), Path=/api/v1/auth/refresh
//     (Path-restricted so the refresh token is only sent to the refresh endpoint)
//
// CSRF mitigation:
//   - SameSite=Strict: cross-site requests cannot carry these cookies.
//     This is the primary CSRF defence. No CSRF tokens are in use — an accepted
//     tradeoff documented in docs/security.md.
//   - IMPORTANT: SameSite=Lax or SameSite=None must never be set on these cookies.
//     Doing so would remove the CSRF protection entirely and require adding
//     double-submit CSRF tokens before any state-changing endpoint.
//   - The guard additionally requires Authorization: Bearer OR a valid cookie,
//     so browser-based API calls from the correct origin work via cookie.
//
// Rate limiting:
//   - login_attempt  : 10 / 15 min per IP
//   - forgot_password: 3 / hour per IP
//   - signup_attempt : 5 / hour per IP

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiter: RateLimitService,
    private readonly lockout: LoginLockoutService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // POST /auth/signup
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() body: SignupDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.rateLimiter.check('signup_attempt', extractClientIp(req));
    await this.rateLimiter.check('signup_attempt_burst', extractClientIp(req));

    await this.authService.signup({
      orgName: body.orgName,
      userName: body.name,
      email: body.email,
      password: body.password,
      termsVersion: body.termsVersion,
      ipAddress: extractClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });

    return { message: 'Account created. Please check your email to verify your address.' };
  }

  // POST /auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.rateLimiter.check('login_attempt', extractClientIp(req));
    await this.rateLimiter.check('login_attempt_burst', extractClientIp(req));

    // Per-account lockout check — applied before the password attempt so a locked
    // account returns 429 without ever touching the bcrypt path.
    await this.lockout.check(body.email);

    const context = { ipAddress: extractClientIp(req), userAgent: req.headers['user-agent'] };

    let tokens: Awaited<ReturnType<AuthService['login']>>;
    try {
      tokens = await this.authService.login(body.email, body.password, context);
    } catch (err) {
      // Increment the per-account failure counter on authentication errors.
      // Non-auth errors (DB down, etc.) propagate without incrementing so
      // a transient infrastructure failure does not eat lockout budget.
      if (err instanceof InvalidCredentialsError || err instanceof EmailNotVerifiedError) {
        await this.lockout.recordFailure(body.email);
      }
      throw err;
    }

    // Successful login — clear any accumulated failure count.
    await this.lockout.clearFailures(body.email);

    setCookies(req, res, tokens.accessToken, tokens.refreshToken, this.config);

    return { message: 'Logged in.' };
  }

  // POST /auth/logout
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const user = (req as Request & { user: JwtPayload }).user;

    // sessionId is absent on tokens issued before the session-tracking migration.
    // Clear the cookies unconditionally — the client is effectively logged out.
    // Best-effort server-side revocation: skip if sessionId unavailable.
    if (user.sessionId) {
      await this.authService.logout(user.sessionId);
    }

    clearCookies(res);

    return { message: 'Logged out.' };
  }

  // POST /auth/refresh
  // Rotates the refresh token and issues a new access token.
  //
  // Reads the raw refresh token from the HttpOnly cookie scoped to this path.
  // On success: sets new accessToken + refreshToken cookies and returns 200.
  //
  // Security properties:
  //   - Rotation on every call: the old refresh token is revoked, a new one issued.
  //   - Token family tracking: if a revoked token is presented (replay), ALL active
  //     sessions in the same family are revoked and the client receives 401.
  //     This protects against token theft — the legitimate holder's subsequent
  //     rotation detects the replay and terminates the attacker's access too.
  //   - The raw refresh token is never logged, only its SHA-256 hash is stored.
  //
  // Error codes (from DomainExceptionFilter):
  //   401 SESSION_REVOKED    — replay attack detected; family has been revoked
  //   401 AUTH_TOKEN_INVALID — token not found, expired, or user account invalid
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const rawRefreshToken: string | undefined = (req.cookies as Record<string, string> | undefined)?.['refreshToken'];
    if (!rawRefreshToken) {
      // No cookie present — client is not authenticated. Throw so NestJS
      // returns a properly structured 401 via the exception filter chain.
      throw new UnauthorizedException('No refresh token provided.');
    }

    const context = { ipAddress: extractClientIp(req), userAgent: req.headers['user-agent'] };
    const tokens = await this.authService.refresh(rawRefreshToken, context);

    setCookies(req, res, tokens.accessToken, tokens.refreshToken, this.config);

    return { message: 'Token refreshed.' };
  }

  // POST /auth/verify-email
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<{ message: string }> {
    await this.authService.verifyEmail(body.token);
    return { message: 'Email verified. You can now log in.' };
  }

  // POST /auth/resend-verification
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body() body: ResendVerificationDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.rateLimiter.check('resend_verification', extractClientIp(req));
    await this.authService.resendVerificationEmail(body.email);
    // Always return 200 regardless of whether the email exists
    return { message: 'If your email is registered and not yet verified, a new link has been sent.' };
  }

  // POST /auth/forgot-password
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() body: RequestPasswordResetDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.rateLimiter.check('forgot_password', extractClientIp(req));

    await this.authService.requestPasswordReset(body.email);
    // Always return 200 regardless of whether the email exists
    return { message: 'If that email address is registered, a password reset link has been sent.' };
  }

  // POST /auth/reset-password
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(body.token, body.newPassword, {
      ipAddress: extractClientIp(req),
    });

    // Clear any active session cookies — all sessions were revoked
    clearCookies(res);

    return { message: 'Password reset successful. Please log in with your new password.' };
  }

  // POST /auth/change-password (authenticated)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const user = (req as Request & { user: JwtPayload }).user;

    // sessionId is absent on tokens issued before the session-tracking migration.
    // changePassword revokes all sessions — it requires the sessionId to correctly
    // exclude the new session from revocation. Reject if unavailable; the user
    // must re-login to obtain a current token before changing their password.
    if (!user.sessionId) {
      throw new UnauthorizedException('Your session is too old. Please log in again before changing your password.');
    }

    await this.authService.changePassword(
      user.sub,
      body.currentPassword,
      body.newPassword,
      user.sessionId,
      { ipAddress: extractClientIp(req) },
    );

    // Clear cookies — all sessions (including current) were revoked; user must re-login
    clearCookies(res);

    return { message: 'Password changed. Please log in again.' };
  }

  // GET /auth/me (authenticated — returns current user's identity and org context)
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request): { userId: string; orgId: string; orgRole: string; role: string } {
    const user = (req as Request & { user: JwtPayload }).user;
    return {
      userId: user.sub,
      orgId: user.orgId,
      orgRole: user.orgRole ?? user.role, // orgRole added after multi-org migration; fall back to platform role
      role: user.role,
    };
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────
//
// SameSite=Strict is the primary CSRF defence. It must NEVER be relaxed to Lax or None
// without simultaneously adding double-submit CSRF tokens to every state-mutating route.
// CsrfOriginMiddleware provides server-side defense-in-depth on top of this.
//
// COOKIE_DOMAIN: when set (e.g. '.example.com'), the cookie is sent to all subdomains.
// Leave unset for single-domain deploys (localhost dev, simple production setups).
// SameSite=Strict still applies to all subdomains — they are "same-site" with each other,
// so the CSRF protection is not weakened by a domain-scoped cookie.

function isSecure(req: Request): boolean {
  // Trust X-Forwarded-Proto if behind a reverse proxy (set via app.set('trust proxy'))
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setCookies(
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string,
  config: ConfigService<Env, true>,
): void {
  const secure = isSecure(req) || config.get('COOKIE_SECURE', { infer: true });
  const domain = config.get('COOKIE_DOMAIN', { infer: true }); // undefined → omit domain attr

  const accessTtlMs = parseTtlToMs(config.get('JWT_ACCESS_TTL', { infer: true }));
  const refreshTtlMs = config.get('JWT_REFRESH_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: accessTtlMs,
    ...(domain ? { domain } : {}),
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/v1/auth/refresh', // scoped: only sent to the refresh endpoint
    maxAge: refreshTtlMs,
    ...(domain ? { domain } : {}),
  });
}

// Parse JWT TTL strings like '15m', '1h', '7d' into milliseconds.
// Falls back to 15 minutes for unrecognised formats.
function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(ttl);
  if (!match) return 15 * 60 * 1000;
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
    default:  return 15 * 60 * 1000;
  }
}

function clearCookies(res: Response): void {
  // path must match what was set; sameSite/httpOnly are not needed for clearing
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
}
