import { jest } from '@jest/globals';
import { OrgService } from '../../src/modules/organizations/org.service';
import { MembershipService } from '../../src/modules/organizations/membership.service';
import { InviteService } from '../../src/modules/organizations/invite.service';
import {
  NotOrgMemberError,
  OrgNotFoundError,
  InviteNotFoundError,
} from '../../src/common/errors/domain.errors';

// ─── Tenant isolation tests ────────────────────────────────────────────────────
//
// Verifies that cross-tenant access is denied at the service layer.
//
// These tests simulate scenarios where a user from Org A attempts to access
// or mutate resources in Org B. The service layer must reject these without
// leaking whether the target org/resource exists.

const ma = <T = any>(value?: T) =>
  jest.fn<() => Promise<T>>().mockResolvedValue(value as T);

// ── OrgService ────────────────────────────────────────────────────────────────

describe('OrgService: cross-tenant access is denied', () => {
  it('getDetail() throws NotOrgMemberError for a non-member of the org', async () => {
    const orgB = { id: 'org-b', name: 'Org B', slug: 'org-b', createdAt: new Date(), _count: { memberships: 3 } };
    const repo = {
      findByIdWithCount: ma(orgB),
      findMembership: ma(null), // user-a is NOT a member of org-b
    } as any;

    const service = new OrgService(repo);

    await expect(service.getDetail('user-a', 'org-b')).rejects.toThrow(NotOrgMemberError);
  });

  it('getDetail() throws OrgNotFoundError for a non-existent org', async () => {
    const repo = {
      findByIdWithCount: ma(null),
      findMembership: ma(null),
    } as any;

    const service = new OrgService(repo);

    await expect(service.getDetail('user-a', 'org-nonexistent')).rejects.toThrow(OrgNotFoundError);
  });
});

// ── MembershipService ─────────────────────────────────────────────────────────

describe('MembershipService: cross-tenant mutation is denied', () => {
  it('removeMember() throws NotOrgMemberError when actor is in a different org', async () => {
    const repo = {
      findMembership: ma(null),
      deleteMembership: ma(undefined),
      countOwners: ma(0),
      transferOwnership: ma(undefined),
      listMembers: ma([]),
    } as any;

    const service = new MembershipService(repo);

    await expect(
      service.removeMember('user-a', 'user-b', 'org-b'),
    ).rejects.toThrow(NotOrgMemberError);

    expect(repo.deleteMembership).not.toHaveBeenCalled();
  });

  it('transferOwnership() throws CannotTransferToNonMemberError when target is not in org', async () => {
    // MembershipService.transferOwnership only checks target membership (guard enforces actor role).
    const repo = {
      findMembership: jest.fn<() => Promise<any>>()
        .mockResolvedValueOnce(null),              // target is not in org-b
      deleteMembership: ma(undefined),
      countOwners: ma(0),
      transferOwnership: ma(undefined),
      listMembers: ma([]),
    } as any;

    const service = new MembershipService(repo);

    const { CannotTransferToNonMemberError } = await import(
      '../../src/common/errors/domain.errors'
    );

    await expect(
      service.transferOwnership('user-a', 'user-b', 'org-b'),
    ).rejects.toThrow(CannotTransferToNonMemberError);

    expect(repo.transferOwnership).not.toHaveBeenCalled();
  });
});

// ── InviteService ─────────────────────────────────────────────────────────────

describe('InviteService: cross-tenant invite manipulation is denied', () => {
  it('revokeInvite() throws InviteNotFoundError when invite belongs to a different org', async () => {
    const repo = {
      findInviteById: ma({ id: 'invite-1', organizationId: 'org-b' }),
      revokeInvite: ma(undefined),
      findUserIdByEmail: ma(null),
      findMembership: ma(null),
      revokePendingInvites: ma(undefined),
      createInvite: ma(null),
      findInviteByHash: ma(null),
      acceptInviteAtomic: ma(undefined),
      findById: ma(null),
    } as any;
    const emailPort = { sendOrgInvite: ma(undefined) } as any;
    const config = { getOrThrow: jest.fn().mockReturnValue('https://app.example.com') } as any;

    const service = new InviteService(repo, emailPort, config);

    await expect(service.revokeInvite('invite-1', 'org-a')).rejects.toThrow(InviteNotFoundError);

    expect(repo.revokeInvite).not.toHaveBeenCalled();
  });

  it('accept() does not leak org membership info via error type', async () => {
    const repo = {
      findInviteByHash: ma(null),
      findInviteById: ma(null),
      findUserIdByEmail: ma(null),
      findMembership: ma(null),
      revokePendingInvites: ma(undefined),
      createInvite: ma(null),
      acceptInviteAtomic: ma(undefined),
      findById: ma(null),
      revokeInvite: ma(undefined),
    } as any;
    const emailPort = { sendOrgInvite: ma(undefined) } as any;
    const config = { getOrThrow: jest.fn().mockReturnValue('https://app.example.com') } as any;

    const service = new InviteService(repo, emailPort, config);

    // Should throw InviteNotFoundError — not reveal anything about the org
    await expect(service.accept('attacker-fabricated-token', 'attacker-id')).rejects.toThrow(
      InviteNotFoundError,
    );
  });
});
