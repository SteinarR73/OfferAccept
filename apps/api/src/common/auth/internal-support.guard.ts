import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard, JwtPayload } from './jwt-auth.guard';
import { extractClientIp } from '../proxy/trusted-proxy.util';
import type { Env } from '../../config/env';
import type { Request } from 'express';

// ─── InternalSupportGuard ──────────────────────────────────────────────────────
// Requires all of the following:
//   1. A valid JWT with role === 'INTERNAL_SUPPORT'
//   2. IP allowlist check    (if SUPPORT_IP_ALLOWLIST is configured)
//   3. Session TTL check     (if SUPPORT_SESSION_TTL_MINUTES is configured)
//   4. MFA claim check       (if REQUIRE_SUPPORT_MFA=true)
//
// Usage: @UseGuards(InternalSupportGuard) on a controller or handler.
// InternalSupportGuard must be registered as a provider in SupportModule so
// that ConfigService is injected correctly.
//
// Role assignment: INTERNAL_SUPPORT is assigned directly in the DB by an
// OfferAccept operator. It must never be self-assigned or assigned by
// customer-facing flows. Customer users can only hold OWNER | ADMIN | MEMBER.
//
// Cross-org access: endpoints behind this guard intentionally do NOT filter
// by orgId. Support staff may inspect offers from any organization.

@Injectable()
export class InternalSupportGuard extends JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalSupportGuard.name);

  constructor(
    jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super(jwtService);
  }

  override canActivate(context: ExecutionContext): boolean {
    // Step 1: Validate JWT (throws UnauthorizedException if invalid)
    const authenticated = super.canActivate(context);
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    // Step 2: Require INTERNAL_SUPPORT role
    if (user.role !== 'INTERNAL_SUPPORT') {
      throw new ForbiddenException('This endpoint requires internal support access.');
    }

    // Step 3: IP allowlist (optional)
    const allowlistRaw = this.config.get('SUPPORT_IP_ALLOWLIST', { infer: true });
    if (allowlistRaw) {
      const ip = extractClientIp(request);
      const allowedIps = allowlistRaw.split(',').map((s) => s.trim()).filter(Boolean);
      if (!allowedIps.includes(ip)) {
        this.logger.warn(JSON.stringify({
          event: 'support_ip_blocked',
          userId: user.sub,
          ip,
          allowedIps,
        }));
        throw new ForbiddenException('Access from this IP address is not permitted for support endpoints.');
      }
    }

    // Step 4: Session TTL (optional)
    const sessionTtlMinutes = this.config.get('SUPPORT_SESSION_TTL_MINUTES', { infer: true });
    if (sessionTtlMinutes !== undefined && user.iat !== undefined) {
      const issuedAtMs = user.iat * 1000; // JWT iat is in seconds
      const maxAgeMs = sessionTtlMinutes * 60 * 1000;
      if (Date.now() - issuedAtMs > maxAgeMs) {
        this.logger.warn(JSON.stringify({
          event: 'support_session_expired',
          userId: user.sub,
          issuedAtMs,
          maxAgeMs,
        }));
        throw new ForbiddenException(
          `Support session has expired (max age: ${sessionTtlMinutes} min). Please re-authenticate.`,
        );
      }
    }

    // Step 5: MFA claim (optional, controlled by REQUIRE_SUPPORT_MFA)
    const requireMfa = this.config.get('REQUIRE_SUPPORT_MFA', { infer: true });
    if (requireMfa) {
      const mfaPayload = user as JwtPayload & { mfaVerifiedAt?: number };
      if (!mfaPayload.mfaVerifiedAt) {
        this.logger.warn(JSON.stringify({
          event: 'support_mfa_required',
          userId: user.sub,
        }));
        throw new ForbiddenException(
          'MFA verification is required to access support endpoints. ' +
          'Re-authenticate with a second factor.',
        );
      }
    }

    return true;
  }
}
