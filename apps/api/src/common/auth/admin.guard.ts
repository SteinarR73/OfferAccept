import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard, JwtPayload } from './jwt-auth.guard';
import type { Request } from 'express';

// ─── Permitted roles ──────────────────────────────────────────────────────────
// Single source of truth for roles that have platform-admin access.
// Update this set when adding or removing privileged roles — the guard logic
// itself does not need to change.
//
// OWNER            — org owner; may configure platform settings for their org.
// INTERNAL_SUPPORT — OfferAccept staff; operational read/write access.
//
// Roles NOT in this set (ADMIN, MEMBER, VIEWER) receive 403.
export const ADMIN_ROLES = new Set<string>(['OWNER', 'INTERNAL_SUPPORT']);

// ─── AdminGuard ────────────────────────────────────────────────────────────────
// Requires a valid JWT whose `role` claim is in ADMIN_ROLES.
// Extends JwtAuthGuard so token extraction and signature verification are
// handled by the parent class.
//
// Usage: @UseGuards(AdminGuard) on a controller or individual handler.
// AdminGuard must be listed as a provider in AdminModule so that JwtService
// is injected correctly into the parent constructor.

@Injectable()
export class AdminGuard extends JwtAuthGuard implements CanActivate {
  constructor(jwtService: JwtService, config: ConfigService) {
    super(jwtService, config);
  }

  override canActivate(context: ExecutionContext): boolean {
    // Step 1: validate JWT — throws UnauthorizedException if missing or invalid.
    const authenticated = super.canActivate(context);
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();

    // Step 2: require an admin-level role.
    if (!ADMIN_ROLES.has(request.user.role)) {
      throw new ForbiddenException('Admin access required.');
    }

    return true;
  }
}
