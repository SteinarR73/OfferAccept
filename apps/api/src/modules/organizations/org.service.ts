import { Injectable } from '@nestjs/common';
import { OrgRepository, OrgWithMemberCount } from './org.repository';
import { OrgNotFoundError, NotOrgMemberError } from '../../common/errors/domain.errors';

// ─── OrgService ────────────────────────────────────────────────────────────────
// Orchestrates org-level operations: create, read, and detail retrieval.
// Membership mutations (remove, transfer) live in MembershipService.
// Invite operations live in InviteService.

@Injectable()
export class OrgService {
  constructor(private readonly repo: OrgRepository) {}

  // Create a new organization owned by the calling user.
  // Org slug is auto-derived from the name; a numeric suffix is appended if taken.
  async create(
    actorId: string,
    params: { name: string },
  ): Promise<{ id: string; name: string; slug: string }> {
    const baseSlug = slugify(params.name);
    const slug = await this.uniqueSlug(baseSlug);

    const org = await this.repo.createWithOwner({ name: params.name, slug }, actorId);
    return { id: org.id, name: org.name, slug: org.slug };
  }

  // Return all orgs the user is a member of.
  async listForUser(userId: string): Promise<OrgSummary[]> {
    const orgs = await this.repo.findAllForUser(userId);
    return orgs.map(toSummary);
  }

  // Return org detail. Caller must be a member.
  async getDetail(userId: string, orgId: string): Promise<OrgDetail> {
    const org = await this.repo.findByIdWithCount(orgId);
    if (!org) throw new OrgNotFoundError();

    const membership = await this.repo.findMembership(userId, orgId);
    if (!membership) throw new NotOrgMemberError();

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      memberCount: org._count.memberships,
      role: membership.role,
      createdAt: org.createdAt,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 1;
    while (await this.repo.slugExists(candidate)) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: Date;
}

export interface OrgDetail extends OrgSummary {
  role: string;
}

function toSummary(org: OrgWithMemberCount): OrgSummary {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    memberCount: org._count.memberships,
    createdAt: org.createdAt,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55) || 'org';
}
