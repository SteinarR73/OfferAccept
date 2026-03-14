import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtAuthGuard, JwtPayload } from './jwt-auth.guard';
import { Request } from 'express';

// ─── InternalSupportGuard ──────────────────────────────────────────────────────
// Requires both:
//   1. A valid JWT (delegates to JwtAuthGuard logic — token is verified)
//   2. role === 'INTERNAL_SUPPORT' in the JWT payload
//
// Usage: @UseGuards(InternalSupportGuard) on a controller or handler.
//
// Role assignment: INTERNAL_SUPPORT is assigned directly in the DB by an
// OfferAccept operator. It must never be self-assigned or assigned by
// customer-facing flows. Customer users can only hold OWNER | ADMIN | MEMBER.
//
// Cross-org access: endpoints behind this guard intentionally do NOT filter
// by orgId. Support staff may inspect offers from any organization.

@Injectable()
export class InternalSupportGuard extends JwtAuthGuard implements CanActivate {
  override canActivate(context: ExecutionContext): boolean {
    // First run normal JWT validation — will throw UnauthorizedException if invalid
    const authenticated = super.canActivate(context);
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (user.role !== 'INTERNAL_SUPPORT') {
      throw new ForbiddenException('This endpoint requires internal support access.');
    }

    return true;
  }
}
