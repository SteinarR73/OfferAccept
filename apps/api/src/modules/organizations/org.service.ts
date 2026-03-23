import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  //
  // Race-safety: the slug uniqueness check (slugExists) and the INSERT are not atomic.
  // A concurrent create can win the race and insert the same slug, causing Prisma P2002.
  // The retry loop re-derives a unique slug and retries up to 5 times before giving up.
  async create(
    actorId: string,
    params: { name: string },
  ): Promise<{ id: string; name: string; slug: string }> {
    const baseSlug = slugify(params.name);

    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = await this.uniqueSlug(baseSlug);
      try {
        const org = await this.repo.createWithOwner({ name: params.name, slug }, actorId);
        return { id: org.id, name: org.name, slug: org.slug };
      } catch (err) {
        if (isSlugUniqueViolation(err)) continue; // concurrent insert won the race — retry
        throw err;
      }
    }

    throw new Error('Could not generate a unique organisation slug. Please try again.');
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

// Returns true when the error is a Prisma unique-constraint violation on the
// slug column — i.e., a concurrent insert won the TOCTOU race.
function isSlugUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray((err.meta as { target?: unknown })?.target) &&
    ((err.meta as { target: string[] }).target).includes('slug')
  );
}
