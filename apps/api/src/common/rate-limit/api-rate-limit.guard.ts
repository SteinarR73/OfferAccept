import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RateLimitService } from './rate-limit.service';
import { ADMIN_ROLES } from '../auth/admin.guard';
import { extractClientIp } from '../proxy/trusted-proxy.util';
import type { JwtPayload } from '../auth/jwt-auth.guard';

// ─── ApiRateLimitGuard ─────────────────────────────────────────────────────────
// Registered as APP_GUARD — runs on every incoming request before the route
// handler. Enforces a per-IP cap to guard against scraping and brute-force abuse.
//
// Rate:    100 requests per minute per IP address
// Backend: Redis (production) or in-process memory (dev/test) — controlled by
//          RATE_LIMIT_BACKEND env var. Falls open when the backend throws so
//          Redis downtime never takes down the API.
//
// Admin exemption:
//   Authenticated users whose JWT role is in ADMIN_ROLES (OWNER, INTERNAL_SUPPORT)
//   are exempt. The token is decoded (signature still verified by JwtService) to
//   read the role claim. An invalid/expired token is treated as unauthenticated
//   and falls through to the IP-based check.
//
// Excluded paths:
//   /api/v1/health* — liveness and readiness probes must never be rate-limited.
//
// Error path:
//   Throws RateLimitExceededError on limit breach.
//   DomainExceptionFilter maps this to 429 { code: "RATE_LIMITED" } with a
//   Retry-After header set by the filter.

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimiter: RateLimitService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Health and metrics paths must never be blocked:
    //   /api/v1/health* — liveness/readiness probes from load balancers
    //   /api/v1/metrics — Prometheus scraper (15 s default interval)
    if (request.path.startsWith('/api/v1/health') ||
        request.path.startsWith('/api/v1/metrics')) return true;

    // Exempt admin users. We verify (not just decode) the token so a forged token
    // with a fake role claim cannot bypass the rate limit.
    if (this.hasAdminToken(request)) return true;

    const ip = extractClientIp(request);
    await this.rateLimiter.check('api_general', ip);
    return true;
  }

  private hasAdminToken(req: Request): boolean {
    const token = extractAccessToken(req);
    if (!token) return false;
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return ADMIN_ROLES.has(payload.role);
    } catch {
      // Expired or invalid — fall through to IP-based check.
      return false;
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractAccessToken(req: Request): string | null {
  // 1. HttpOnly cookie (browser clients)
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.['accessToken'];
  if (cookieToken) return cookieToken;

  // 2. Authorization: Bearer header (API / mobile clients)
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }

  return null;
}
