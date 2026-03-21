import { jest } from '@jest/globals';
import { MembershipService, roleAtLeast } from '../../src/modules/organizations/membership.service';
import {
  NotOrgMemberError,
  InsufficientOrgRoleError,
  CannotRemoveLastOwnerError,
  CannotTransferToNonMemberError,
} from '../../src/common/errors/domain.errors';

// ─── Membership tests ──────────────────────────────────────────────────────────
//
// Verifies:
//   - roleAtLeast() hierarchy (OWNER > ADMIN > MEMBER)
//   - requireMembership() throws NotOrgMemberError for non-member
//   - requireRole() throws InsufficientOrgRoleError for low-rank caller
//   - removeMember() enforces last-owner protection
//   - removeMember() enforces ADMIN cannot remove ADMIN or OWNER
//   - transferOwnership() requires target to be an existing member

// Jest 29: use jest.fn<() => Promise<any>>() to avoid the ResolveType<UnknownFunction>=never issue
const ma = <T = any>(value?: T) =>
  jest.fn<() => Promise<T>>().mockResolvedValue(value as T);

type RepoMock = {
  findMembership: jest.Mock<() => Promise<any>>;
  deleteMembership: jest.Mock<() => Promise<any>>;
  countOwners: jest.Mock<() => Promise<any>>;
  transferOwnership: jest.Mock<() => Promise<any>>;
  listMembers: jest.Mock<() => Promise<any>>;
};

function buildRepo(overrides: Partial<RepoMock> = {}): RepoMock {
  return {
    findMembership: ma(null),
    deleteMembership: ma(undefined),
    countOwners: ma(1),
    transferOwnership: ma(undefined),
    listMembers: ma([]),
    ...overrides,
  };
}

function buildService(repoOverrides: Partial<RepoMock> = {}) {
  const repo = buildRepo(repoOverrides) as any;
  const service = new MembershipService(repo);
  return { service, repo };
}

// ── roleAtLeast() ──────────────────────────────────────────────────────────────

describe('roleAtLeast()', () => {
  it('OWNER satisfies OWNER', () => expect(roleAtLeast('OWNER', 'OWNER')).toBe(true));
  it('OWNER satisfies ADMIN', () => expect(roleAtLeast('OWNER', 'ADMIN')).toBe(true));
  it('OWNER satisfies MEMBER', () => expect(roleAtLeast('OWNER', 'MEMBER')).toBe(true));
  it('ADMIN satisfies ADMIN', () => expect(roleAtLeast('ADMIN', 'ADMIN')).toBe(true));
  it('ADMIN satisfies MEMBER', () => expect(roleAtLeast('ADMIN', 'MEMBER')).toBe(true));
  it('ADMIN does NOT satisfy OWNER', () => expect(roleAtLeast('ADMIN', 'OWNER')).toBe(false));
  it('MEMBER satisfies MEMBER', () => expect(roleAtLeast('MEMBER', 'MEMBER')).toBe(true));
  it('MEMBER does NOT satisfy ADMIN', () => expect(roleAtLeast('MEMBER', 'ADMIN')).toBe(false));
  it('MEMBER does NOT satisfy OWNER', () => expect(roleAtLeast('MEMBER', 'OWNER')).toBe(false));
});

// ── requireMembership() ───────────────────────────────────────────────────────

describe('MembershipService.requireMembership()', () => {
  it('throws NotOrgMemberError when no membership found', async () => {
    const { service } = buildService({ findMembership: ma(null) });

    await expect(service.requireMembership('user-1', 'org-1')).rejects.toThrow(NotOrgMemberError);
  });

  it('returns membership when found', async () => {
    const ms = { userId: 'user-1', organizationId: 'org-1', role: 'MEMBER' };
    const { service } = buildService({ findMembership: ma(ms) });

    const result = await service.requireMembership('user-1', 'org-1');
    expect(result).toEqual(ms);
  });
});

// ── requireRole() ─────────────────────────────────────────────────────────────

describe('MembershipService.requireRole()', () => {
  it('throws InsufficientOrgRoleError when rank is too low', async () => {
    const { service } = buildService({ findMembership: ma({ role: 'MEMBER' }) });

    await expect(service.requireRole('user-1', 'org-1', 'ADMIN')).rejects.toThrow(
      InsufficientOrgRoleError,
    );
  });

  it('passes when caller has exact required role', async () => {
    const { service } = buildService({ findMembership: ma({ role: 'ADMIN' }) });

    await expect(service.requireRole('user-1', 'org-1', 'ADMIN')).resolves.not.toThrow();
  });

  it('passes when caller has higher role than required', async () => {
    const { service } = buildService({ findMembership: ma({ role: 'OWNER' }) });

    await expect(service.requireRole('user-1', 'org-1', 'ADMIN')).resolves.not.toThrow();
  });
});

// ── removeMember() ────────────────────────────────────────────────────────────

describe('MembershipService.removeMember()', () => {
  it('throws NotOrgMemberError when actor is not a member', async () => {
    const { service } = buildService({ findMembership: ma(null) });

    await expect(service.removeMember('actor', 'target', 'org-1')).rejects.toThrow(
      NotOrgMemberError,
    );
  });

  it('throws NotOrgMemberError when target is not a member', async () => {
    const { service } = buildService({
      findMembership: jest.fn<() => Promise<any>>()
        .mockResolvedValueOnce({ role: 'OWNER' }) // actor
        .mockResolvedValueOnce(null),              // target
    });

    await expect(service.removeMember('actor', 'target', 'org-1')).rejects.toThrow(
      NotOrgMemberError,
    );
  });

  it('throws CannotRemoveLastOwnerError when removing the only OWNER', async () => {
    const { service } = buildService({
      findMembership: jest.fn<() => Promise<any>>()
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ role: 'OWNER' }),
      countOwners: ma(1),
    });

    await expect(service.removeMember('actor', 'target', 'org-1')).rejects.toThrow(
      CannotRemoveLastOwnerError,
    );
  });

  it('allows OWNER to remove another OWNER when multiple owners exist', async () => {
    const { service, repo } = buildService({
      findMembership: jest.fn<() => Promise<any>>()
        .mockResolvedValueOnce({ role: 'OWNER' })
        .mockResolvedValueOnce({ role: 'OWNER' }),
      countOwners: ma(2),
    });

    await service.removeMember('actor', 'target', 'org-1');

    expect(repo.deleteMembership).toHaveBeenCalledWith('target', 'org-1');
  });

  it('throws InsufficientOrgRoleError when ADMIN tries to remove ADMIN', async () => {
    const { service } = buildService({
      findMembership: jest.fn<() => Promise<any>>()
        .mockResolvedValueOnce({ role: 'ADMIN' })
        .mockResolvedValueOnce({ role: 'ADMIN' }),
    });

    await expect(service.removeMember('actor', 'target', 'org-1')).rejects.toThrow(
      InsufficientOrgRoleError,
    );
  });

  it('allows ADMIN to remove a MEMBER', async () => {
    const { service, repo } = buildService({
      findMembership: jest.fn<() => Promise<any>>()
        .mockResolvedValueOnce({ role: 'ADMIN' })
        .mockResolvedValueOnce({ role: 'MEMBER' }),
    });

    await service.removeMember('actor', 'target', 'org-1');

    expect(repo.deleteMembership).toHaveBeenCalledWith('target', 'org-1');
  });
});

// ── transferOwnership() ───────────────────────────────────────────────────────

describe('MembershipService.transferOwnership()', () => {
  it('throws CannotTransferToNonMemberError when target is not a member', async () => {
    const { service } = buildService({ findMembership: ma(null) });

    await expect(service.transferOwnership('from', 'to', 'org-1')).rejects.toThrow(
      CannotTransferToNonMemberError,
    );
  });

  it('calls repo.transferOwnership when target is an existing member', async () => {
    const { service, repo } = buildService({ findMembership: ma({ role: 'MEMBER' }) });

    await service.transferOwnership('from', 'to', 'org-1');

    expect(repo.transferOwnership).toHaveBeenCalledWith('from', 'to', 'org-1');
  });
});
