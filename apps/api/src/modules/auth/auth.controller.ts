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
} from '@nestjs/common';
import { Request, Response } from 'express';
import { IsEmail, IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard, JwtPayload } from '../../common/auth/jwt-auth.guard';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { extractClientIp } from '../../common/proxy/trusted-proxy.util';

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
//   - SameSite=Strict: cross-site requests cannot carry these cookies
//   - The guard additionally requires Authorization: Bearer OR a valid cookie,
//     so browser-based API calls from the correct origin work via cookie.
//
// Rate limiting:
//   - login_attempt  : 10 / 15 min per IP
//   - forgot_password: 3 / hour per IP
//   - signup_attempt : 5 / hour per IP

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiter: RateLimitService,
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

    const context = { ipAddress: extractClientIp(req), userAgent: req.headers['user-agent'] };
    const tokens = await this.authService.login(body.email, body.password, context);

    setCookies(req, res, tokens.accessToken, tokens.refreshToken);

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
    await this.authService.logout(user.sessionId!);

    clearCookies(res);

    return { message: 'Logged out.' };
  }

  // POST /auth/refresh
  // Rotates the refresh token and issues a new access token.
  // Reads the raw refresh token from the HttpOnly cookie.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const rawRefreshToken: string | undefined = req.cookies?.['refreshToken'];
    if (!rawRefreshToken) {
      res.status(HttpStatus.UNAUTHORIZED).json({ message: 'No refresh token provided.' });
      return { message: 'No refresh token.' };
    }

    const context = { ipAddress: extractClientIp(req), userAgent: req.headers['user-agent'] };
    const tokens = await this.authService.refresh(rawRefreshToken, context);

    setCookies(req, res, tokens.accessToken, tokens.refreshToken);

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
  async resendVerification(@Body() body: ResendVerificationDto): Promise<{ message: string }> {
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

    await this.authService.changePassword(
      user.sub,
      body.currentPassword,
      body.newPassword,
      user.sessionId!,
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

function isSecure(req: Request): boolean {
  // Trust X-Forwarded-Proto if behind a reverse proxy (set via app.set('trust proxy'))
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setCookies(req: Request, res: Response, accessToken: string, refreshToken: string): void {
  const secure = isSecure(req) || process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes (mirrors JWT_ACCESS_TTL)
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/v1/auth/refresh', // scoped: only sent to the refresh endpoint
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (mirrors JWT_REFRESH_TTL_DAYS)
  });
}

function clearCookies(res: Response): void {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
}
