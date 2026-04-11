import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, Organization, Membership, OrgRole, Prisma } from '@prisma/client';

// ─── OrgRepository ─────────────────────────────────────────────────────────────
// All DB queries for the organizations domain.
// Callers (services) enforce authorization before calling these methods.

export type OrgWithMemberCount = Organization & { _count: { memberships: number } };

export type MembershipWithUser = Membership & {
  user: { id: string; name: string; email: string };
};

@Injectable()
export class OrgRepository {
  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // ── Organizations ─────────────────────────────────────────────────────────────

  async findById(orgId: string): Promise<Organization | null> {
    return this.db.organization.findUnique({ where: { id: orgId, deletedAt: null } });
  }

  async findByIdWithCount(orgId: string): Promise<OrgWithMemberCount | null> {
    return this.db.organization.findUnique({
      where: { id: orgId, deletedAt: null },
      include: { _count: { select: { memberships: true } } },
    });
  }

  // All orgs where userId has any membership
  async findAllForUser(userId: string): Promise<OrgWithMemberCount[]> {
    return this.db.organization.findMany({
      where: {
        deletedAt: null,
        memberships: { some: { userId } },
      },
      include: { _count: { select: { memberships: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Create org + seed OWNER membership atomically
  async createWithOwner(
    params: { name: string; slug: string },
    ownerId: string,
  ): Promise<Organization> {
    return this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: params });
      await tx.membership.create({
        data: { userId: ownerId, organizationId: org.id, role: 'OWNER' },
      });
      return org;
    });
  }

  // ── Membership ────────────────────────────────────────────────────────────────

  async findMembership(userId: string, orgId: string): Promise<Membership | null> {
    return this.db.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
  }

  async listMembers(orgId: string): Promise<MembershipWithUser[]> {
    return this.db.membership.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMembership(userId: string, orgId: string, role: OrgRole): Promise<Membership> {
    return this.db.membership.create({
      data: { userId, organizationId: orgId, role },
    });
  }

  async updateMembershipRole(userId: string, orgId: string, role: OrgRole): Promise<Membership> {
    return this.db.membership.update({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      data: { role },
    });
  }

  async deleteMembership(userId: string, orgId: string): Promise<void> {
    await this.db.membership.delete({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
  }

  async countOwners(orgId: string): Promise<number> {
    return this.db.membership.count({ where: { organizationId: orgId, role: 'OWNER' } });
  }

  // Atomic ownership transfer: old OWNER → ADMIN, new OWNER gets OWNER
  async transferOwnership(
    fromUserId: string,
    toUserId: string,
    orgId: string,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.membership.update({
        where: { userId_organizationId: { userId: fromUserId, organizationId: orgId } },
        data: { role: 'ADMIN' },
      }),
      this.db.membership.update({
        where: { userId_organizationId: { userId: toUserId, organizationId: orgId } },
        data: { role: 'OWNER' },
      }),
    ]);
  }

  // ── Invites ───────────────────────────────────────────────────────────────────

  async findInviteByHash(tokenHash: string) {
    return this.db.invite.findUnique({ where: { tokenHash } });
  }

  async findInviteById(id: string) {
    return this.db.invite.findUnique({ where: { id } });
  }

  async createInvite(data: {
    organizationId: string;
    email: string;
    role: OrgRole;
    tokenHash: string;
    expiresAt: Date;
    invitedById: string;
  }) {
    return this.db.invite.create({ data: { ...data, email: data.email.toLowerCase().trim() } });
  }

  async markInviteAccepted(inviteId: string): Promise<void> {
    await this.db.invite.update({
      where: { id: inviteId },
      data: { acceptedAt: new Date() },
    });
  }

  async revokeInvite(inviteId: string): Promise<void> {
    await this.db.invite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
  }

  // Revoke all pending (non-accepted, non-revoked) invites for email + org
  async revokePendingInvites(email: string, orgId: string): Promise<void> {
    await this.db.invite.updateMany({
      where: {
        email: email.toLowerCase().trim(),
        organizationId: orgId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  // List active (not accepted, not revoked, not expired) invites for an org
  async listActiveInvites(orgId: string) {
    return this.db.invite.findMany({
      where: {
        organizationId: orgId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async slugExists(slug: string): Promise<boolean> {
    const count = await this.db.organization.count({ where: { slug } });
    return count > 0;
  }

  // ── Email normalization note ──────────────────────────────────────────────────
  // Invite.email and User.email are PostgreSQL `text` columns — case-sensitive.
  // All methods below normalize to .toLowerCase().trim() at the DB boundary.
  // Never omit this normalization or two records with different capitalisation
  // will be treated as distinct identities.

  // Find a user by email (needed for invite duplicate-member check)
  async findUserIdByEmail(email: string): Promise<string | null> {
    const user = await this.db.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  // Atomically create Membership + mark invite accepted
  async acceptInviteAtomic(inviteId: string, userId: string, orgId: string, role: import('@prisma/client').OrgRole): Promise<void> {
    await this.db.$transaction([
      this.db.membership.create({
        data: { userId, organizationId: orgId, role },
      }),
      this.db.invite.update({
        where: { id: inviteId },
        data: { acceptedAt: new Date() },
      }),
    ]);
  }
}
