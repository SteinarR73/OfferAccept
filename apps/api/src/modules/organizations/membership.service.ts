import { Injectable } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { OrgRepository } from './org.repository';
import {
  NotOrgMemberError,
  InsufficientOrgRoleError,
  CannotRemoveLastOwnerError,
  CannotTransferToNonMemberError,
} from '../../common/errors/domain.errors';

// ─── Role hierarchy ────────────────────────────────────────────────────────────
// OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)
// Used to check whether a caller's role satisfies a minimum requirement.

const ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export function roleAtLeast(actual: OrgRole, required: OrgRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

// ─── MembershipService ─────────────────────────────────────────────────────────
// Business logic for membership mutations.
// Authorization (caller must have correct role) is enforced in OrgRoleGuard before
// the controller method is reached; the service performs secondary domain checks.

@Injectable()
export class MembershipService {
  constructor(private readonly repo: OrgRepository) {}

  // Load caller's membership; throw if not a member.
  async requireMembership(userId: string, orgId: string) {
    const membership = await this.repo.findMembership(userId, orgId);
    if (!membership) throw new NotOrgMemberError();
    return membership;
  }

  // Load caller's membership; throw if role is insufficient.
  async requireRole(userId: string, orgId: string, minRole: OrgRole) {
    const membership = await this.requireMembership(userId, orgId);
    if (!roleAtLeast(membership.role, minRole)) {
      throw new InsufficientOrgRoleError(minRole);
    }
    return membership;
  }

  // Remove a member from an org.
  // Rules:
  //   - Cannot remove the last owner
  //   - ADMIN can only remove MEMBER-ranked users
  //   - OWNER can remove anyone (except the last owner)
  async removeMember(
    actorUserId: string,
    targetUserId: string,
    orgId: string,
  ): Promise<void> {
    const [actorMembership, targetMembership] = await Promise.all([
      this.repo.findMembership(actorUserId, orgId),
      this.repo.findMembership(targetUserId, orgId),
    ]);

    if (!actorMembership) throw new NotOrgMemberError();
    if (!targetMembership) throw new NotOrgMemberError();

    // Enforce: ADMIN can only remove MEMBERs (not other ADMINs or OWNERs)
    if (
      actorMembership.role === 'ADMIN' &&
      !roleAtLeast('MEMBER', targetMembership.role) // target is ADMIN or OWNER
    ) {
      throw new InsufficientOrgRoleError('OWNER');
    }
    // More precise: ADMIN cannot remove ADMIN or OWNER
    if (actorMembership.role === 'ADMIN' && targetMembership.role !== 'MEMBER') {
      throw new InsufficientOrgRoleError('OWNER');
    }

    // Cannot remove the last owner
    if (targetMembership.role === 'OWNER') {
      const ownerCount = await this.repo.countOwners(orgId);
      if (ownerCount <= 1) throw new CannotRemoveLastOwnerError();
    }

    await this.repo.deleteMembership(targetUserId, orgId);
  }

  // Transfer org ownership to another existing member.
  // Only the current OWNER may call this (enforced by guard before calling here).
  async transferOwnership(
    fromUserId: string,
    toUserId: string,
    orgId: string,
  ): Promise<void> {
    const targetMembership = await this.repo.findMembership(toUserId, orgId);
    if (!targetMembership) throw new CannotTransferToNonMemberError();

    await this.repo.transferOwnership(fromUserId, toUserId, orgId);
  }

  async listMembers(orgId: string) {
    return this.repo.listMembers(orgId);
  }
}
