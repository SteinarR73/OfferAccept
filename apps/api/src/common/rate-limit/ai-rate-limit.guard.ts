import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RateLimitService } from './rate-limit.service';
import { ADMIN_ROLES } from '../auth/admin.guard';
import type { JwtPayload } from '../auth/jwt-auth.guard';

// ─── AiRateLimitGuard ──────────────────────────────────────────────────────────
// Applied per-endpoint via @UseGuards(AiRateLimitGuard) on AI-driven routes.
// Must be composed after JwtAuthGuard so that req.user is already populated.
//
// Rate:    10 requests per hour per authenticated user (keyed by userId)
// Backend: Redis (production) or in-process memory (dev/test) — controlled by
//          RATE_LIMIT_BACKEND env var. Falls open when the backend throws.
//
// Admin exemption:
//   Users whose JWT role is in ADMIN_ROLES (OWNER, INTERNAL_SUPPORT) are exempt.
//   Role is read from req.user which JwtAuthGuard already verified.
//
// Usage:
//   @UseGuards(JwtAuthGuard, AiRateLimitGuard)  ← order matters; JWT runs first
//   async generateContent(@CurrentUser() user: JwtPayload) { ... }
//
// Error path:
//   Throws RateLimitExceededError on limit breach.
//   DomainExceptionFilter maps this to 429 { code: "RATE_LIMITED" } with a
//   Retry-After header set by the filter.

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = req.user;

    // If user is absent, JwtAuthGuard (which must run first) will reject the
    // request. Pass through here so the correct 401 is returned rather than
    // a misleading 429.
    if (!user) return true;

    // Admin users are exempt from AI generation rate limits.
    if (ADMIN_ROLES.has(user.role)) return true;

    // Limit per authenticated user — IP-based keying would allow a single user
    // to bypass limits by rotating IPs.
    await this.rateLimiter.check('ai_generation', user.sub);
    return true;
  }
}
