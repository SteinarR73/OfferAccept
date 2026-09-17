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
//   2. IP allowlist check (mandatory in production)
//   3. Session TTL check (mandatory in production)
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
  private readonly supportConfig: ConfigService<Env, true>;

  constructor(
    jwtService: JwtService,
    config: ConfigService<Env, true>,
  ) {
    // Cast to the unparameterized ConfigService expected by JwtAuthGuard — safe
    // because ConfigService<Env, true> is structurally compatible at runtime.
    super(jwtService, config as unknown as ConfigService);
    this.supportConfig = config;
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

    const isProd = this.supportConfig.get('NODE_ENV', { infer: true }) === 'production';

    // Step 3: IP allowlist (mandatory in prod)
    const allowlistRaw = this.supportConfig.get('SUPPORT_IP_ALLOWLIST', { infer: true });
    if (!allowlistRaw && isProd) {
      throw new ForbiddenException('Support access is disabled (IP allowlist not configured in production).');
    }
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

    // Step 4: Session TTL (mandatory in prod)
    const sessionTtlMinutes = this.supportConfig.get('SUPPORT_SESSION_TTL_MINUTES', { infer: true });
    if (sessionTtlMinutes === undefined && isProd) {
      throw new ForbiddenException('Support access is disabled (Session TTL not configured in production).');
    }
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

    return true;
  }
}
