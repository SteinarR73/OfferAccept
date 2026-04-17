import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';

// ─── JwtAuthGuard ──────────────────────────────────────────────────────────────
// Verifies the short-lived access token and attaches the decoded payload to
// request.user.
//
// Token location (checked in order):
//   1. Cookie 'accessToken' (HttpOnly — primary method for browser clients)
//   2. Authorization: Bearer <token> header (fallback for API / mobile clients)
//
// If both are present, the cookie takes precedence.
//
// sessionId is included in the JWT payload so that logout/change-password can
// revoke the specific session that issued this token.
//
// ── Key rotation support ───────────────────────────────────────────────────────
// JWT_SECRETS (env) is an optional comma-separated list of previous signing
// secrets. Verification is attempted with JWT_SECRET first (the current
// signing key), then each entry in JWT_SECRETS in order. This allows tokens
// issued under a previous key to remain valid during a rotation window.
// Signing always uses JWT_SECRET (the primary key). Once all clients have
// refreshed their tokens, remove the old secret from JWT_SECRETS.

export interface JwtPayload {
  sub: string;         // userId
  orgId: string;       // primary org from Membership
  orgRole?: string;    // OrgRole from Membership (present on tokens issued after multi-org migration)
  role: string;        // platform UserRole (OWNER/ADMIN/MEMBER/INTERNAL_SUPPORT)
  sessionId?: string;  // present on tokens issued by the new auth flow
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly rotationSecrets: string[];

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    // Build the list of legacy secrets to try if the primary key fails.
    const extraSecrets = this.config.get<string>('JWT_SECRETS', '');
    this.rotationSecrets = extraSecrets
      ? extraSecrets.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    // 1. Try the primary (current) secret via @nestjs/jwt
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      (request as Request & { user: JwtPayload }).user = payload;
      return true;
    } catch {
      // Fall through to rotation secrets
    }

    // 2. Try each legacy rotation secret in order
    for (const secret of this.rotationSecrets) {
      try {
        const payload = jwt.verify(token, secret) as JwtPayload;
        (request as Request & { user: JwtPayload }).user = payload;
        return true;
      } catch {
        // Try the next secret
      }
    }

    throw new UnauthorizedException('Invalid or expired token.');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  // 1. HttpOnly cookie (preferred for browser clients)
  const cookieToken: string | undefined = (req.cookies as Record<string, string> | undefined)?.['accessToken'];
  if (cookieToken) return cookieToken;

  // 2. Authorization: Bearer header (API / mobile clients)
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  return null;
}
