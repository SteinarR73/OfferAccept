import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { OrgRepository } from '../org.repository';
import { JwtPayload } from '../../../common/auth/jwt-auth.guard';
import { NotOrgMemberError, InsufficientOrgRoleError } from '../../../common/errors/domain.errors';
import { roleAtLeast } from '../membership.service';

// OrgRole values as a plain union — mirrors the Prisma enum without importing it.
// Using a string literal type here keeps the guard decoupled from Prisma generation state.
// Hierarchy: OWNER > ADMIN > MEMBER > VIEWER
type OrgRoleValue = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

// ─── RequireOrgRole decorator ──────────────────────────────────────────────────
// Applied to controller methods that require the caller to have at least `role`
// within the org identified by the `:id` route param.
//
// Example usage:
//   @UseGuards(JwtAuthGuard, OrgRoleGuard)
//   @RequireOrgRole('ADMIN')
//   @Post(':id/invite')
//   async invite(...) { ... }

export const REQUIRE_ORG_ROLE_KEY = 'org_role';
export const RequireOrgRole = (role: OrgRoleValue) => SetMetadata(REQUIRE_ORG_ROLE_KEY, role);

// ─── OrgRoleGuard ──────────────────────────────────────────────────────────────
// Reads the minimum required role from @RequireOrgRole metadata, looks up the
// caller's Membership in the DB, and enforces the hierarchy check.
//
// Requires JwtAuthGuard to have run first (so request.user is populated).
// Reads orgId from request.params.id.
//
// Throws domain errors (mapped to HTTP by DomainExceptionFilter):
//   - NotOrgMemberError   → 403
//   - InsufficientOrgRoleError → 403

@Injectable()
export class OrgRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repo: OrgRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.get<OrgRoleValue>(
      REQUIRE_ORG_ROLE_KEY,
      context.getHandler(),
    );

    // If no role is required, allow through
    if (!requiredRole) return true;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const userId = request.user?.sub;
    // params.id can be string | string[] in Express types; always take the first value
    const rawId = request.params?.id;
    const orgId: string | undefined = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!userId || !orgId) {
      throw new NotOrgMemberError();
    }

    const membership = await this.repo.findMembership(userId, orgId);
    if (!membership) throw new NotOrgMemberError();

    if (!roleAtLeast(membership.role as OrgRoleValue, requiredRole)) {
      throw new InsufficientOrgRoleError(requiredRole);
    }

    return true;
  }
}
