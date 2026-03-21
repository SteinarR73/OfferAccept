import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

export interface JwtPayload {
  sub: string;         // userId
  orgId: string;
  role: string;
  sessionId?: string;  // present on tokens issued by the new auth flow
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      (request as Request & { user: JwtPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
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
