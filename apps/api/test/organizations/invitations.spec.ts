import { jest } from '@jest/globals';
import { InviteService } from '../../src/modules/organizations/invite.service';
import {
  AlreadyOrgMemberError,
  InviteExpiredError,
  InviteNotFoundError,
  InsufficientOrgRoleError,
  OrgNotFoundError,
  NotOrgMemberError,
} from '../../src/common/errors/domain.errors';

// ─── Invitation tests ──────────────────────────────────────────────────────────
//
// Verifies:
//   - invite() sends email and creates invite record
//   - invite() prevents ADMIN from inviting OWNER/ADMIN
//   - invite() prevents re-inviting an existing member
//   - invite() throws OrgNotFoundError for unknown org
//   - invite() throws NotOrgMemberError when actor is not a member
//   - accept() rejects expired/unknown/replayed/revoked tokens
//   - accept() succeeds and calls acceptInviteAtomic
//   - revokeInvite() enforces org ownership

// Jest 29: mockResolvedValue's parameter type is ResolveType<T> = never when T=UnknownFunction.
// Use jest.fn<() => Promise<any>>() to get a mock that accepts any resolved value.
const ma = <T = any>(value?: T) =>
  jest.fn<() => Promise<T>>().mockResolvedValue(value as T);

const ADMIN_MEMBERSHIP = { role: 'ADMIN' as const };
const OWNER_MEMBERSHIP = { role: 'OWNER' as const };

type RepoMock = {
  findById: jest.Mock<() => Promise<any>>;
  findUserIdByEmail: jest.Mock<() => Promise<any>>;
  findMembership: jest.Mock<() => Promise<any>>;
  revokePendingInvites: jest.Mock<() => Promise<any>>;
  createInvite: jest.Mock<() => Promise<any>>;
  findInviteByHash: jest.Mock<() => Promise<any>>;
  findInviteById: jest.Mock<() => Promise<any>>;
  acceptInviteAtomic: jest.Mock<() => Promise<any>>;
  revokeInvite: jest.Mock<() => Promise<any>>;
};

function buildRepo(overrides: Partial<RepoMock> = {}): RepoMock {
  return {
    findById: ma({ id: 'org-1', name: 'Acme' }),
    findUserIdByEmail: ma(null),
    findMembership: ma(ADMIN_MEMBERSHIP),
    revokePendingInvites: ma(undefined),
    createInvite: ma({ id: 'invite-1' }),
    findInviteByHash: ma(null),
    findInviteById: ma(null),
    acceptInviteAtomic: ma(undefined),
    revokeInvite: ma(undefined),
    ...overrides,
  };
}

function buildService(repoOverrides: Partial<RepoMock> = {}) {
  const repo = buildRepo(repoOverrides) as any;
  const email = { sendOrgInvite: ma(undefined) } as any;
  const config = { getOrThrow: jest.fn().mockReturnValue('https://app.example.com') } as any;
  const service = new InviteService(repo, email, config);
  return { service, repo, email };
}

const BASE_INVITE_PARAMS = {
  orgId: 'org-1',
  email: 'bob@example.com',
  role: 'MEMBER' as const,
  invitedById: 'admin-1',
};

// ── invite() ──────────────────────────────────────────────────────────────────

describe('InviteService.invite()', () => {
  it('creates an invite and sends email for a new user', async () => {
    const { service, repo, email } = buildService();

    await service.invite(BASE_INVITE_PARAMS);

    expect(repo.revokePendingInvites).toHaveBeenCalledWith('bob@example.com', 'org-1');
    expect(repo.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        email: 'bob@example.com',
        role: 'MEMBER',
        invitedById: 'admin-1',
      }),
    );
    expect(email.sendOrgInvite).toHaveBeenCalled();
  });

  it('throws OrgNotFoundError when org does not exist', async () => {
    const { service } = buildService({ findById: ma(null) });

    await expect(service.invite(BASE_INVITE_PARAMS)).rejects.toThrow(OrgNotFoundError);
  });

  it('throws NotOrgMemberError when actor is not in the org', async () => {
    const findMembership = jest.fn<() => Promise<any>>().mockResolvedValueOnce(null);
    const { service } = buildService({ findMembership });

    await expect(service.invite(BASE_INVITE_PARAMS)).rejects.toThrow(NotOrgMemberError);
  });

  it('throws AlreadyOrgMemberError if email belongs to existing member', async () => {
    const findMembership = jest.fn<() => Promise<any>>()
      .mockResolvedValueOnce(ADMIN_MEMBERSHIP)   // actor
      .mockResolvedValueOnce({ role: 'MEMBER' }); // invitee already in org
    const { service } = buildService({
      findMembership,
      findUserIdByEmail: ma('existing-user'),
    });

    await expect(service.invite(BASE_INVITE_PARAMS)).rejects.toThrow(AlreadyOrgMemberError);
  });

  it('throws InsufficientOrgRoleError when ADMIN tries to invite OWNER', async () => {
    const { service } = buildService({
      findMembership: ma(ADMIN_MEMBERSHIP),
    });

    await expect(
      service.invite({ ...BASE_INVITE_PARAMS, role: 'OWNER' as never }),
    ).rejects.toThrow(InsufficientOrgRoleError);
  });

  it('throws InsufficientOrgRoleError when ADMIN tries to invite ADMIN', async () => {
    const { service } = buildService({
      findMembership: ma(ADMIN_MEMBERSHIP),
    });

    await expect(
      service.invite({ ...BASE_INVITE_PARAMS, role: 'ADMIN' as never }),
    ).rejects.toThrow(InsufficientOrgRoleError);
  });

  it('OWNER can invite ADMIN', async () => {
    const { service, repo } = buildService({
      findMembership: ma(OWNER_MEMBERSHIP),
    });

    await service.invite({ ...BASE_INVITE_PARAMS, role: 'ADMIN' as const });

    expect(repo.createInvite).toHaveBeenCalled();
  });
});

// ── accept() ──────────────────────────────────────────────────────────────────

describe('InviteService.accept()', () => {
  it('throws InviteNotFoundError for unknown token', async () => {
    const { service } = buildService({ findInviteByHash: ma(null) });

    await expect(service.accept('bad-token', 'user-1')).rejects.toThrow(InviteNotFoundError);
  });

  it('throws InviteNotFoundError for already accepted invite (replay protection)', async () => {
    const { service } = buildService({
      findInviteByHash: ma({
        id: 'invite-1',
        expiresAt: new Date(Date.now() + 100_000),
        acceptedAt: new Date(),
        revokedAt: null,
        organizationId: 'org-1',
        role: 'MEMBER',
      }),
    });

    await expect(service.accept('some-token', 'user-1')).rejects.toThrow(InviteNotFoundError);
  });

  it('throws InviteNotFoundError for revoked invite', async () => {
    const { service } = buildService({
      findInviteByHash: ma({
        id: 'invite-1',
        expiresAt: new Date(Date.now() + 100_000),
        acceptedAt: null,
        revokedAt: new Date(),
        organizationId: 'org-1',
        role: 'MEMBER',
      }),
    });

    await expect(service.accept('some-token', 'user-1')).rejects.toThrow(InviteNotFoundError);
  });

  it('throws InviteExpiredError for expired token', async () => {
    const { service } = buildService({
      findInviteByHash: ma({
        id: 'invite-1',
        expiresAt: new Date(Date.now() - 1000),
        acceptedAt: null,
        revokedAt: null,
        organizationId: 'org-1',
        role: 'MEMBER',
      }),
    });

    await expect(service.accept('some-token', 'user-1')).rejects.toThrow(InviteExpiredError);
  });

  it('calls acceptInviteAtomic on a valid invite', async () => {
    const validInvite = {
      id: 'invite-1',
      expiresAt: new Date(Date.now() + 100_000),
      acceptedAt: null,
      revokedAt: null,
      organizationId: 'org-1',
      role: 'MEMBER',
    };

    const { service, repo } = buildService({
      findInviteByHash: ma(validInvite),
      findMembership: ma(null),
    });

    await service.accept('valid-token', 'user-1');

    expect(repo.acceptInviteAtomic).toHaveBeenCalledWith('invite-1', 'user-1', 'org-1', 'MEMBER');
  });

  it('throws AlreadyOrgMemberError if user is already a member', async () => {
    const validInvite = {
      id: 'invite-1',
      expiresAt: new Date(Date.now() + 100_000),
      acceptedAt: null,
      revokedAt: null,
      organizationId: 'org-1',
      role: 'MEMBER',
    };

    const { service } = buildService({
      findInviteByHash: ma(validInvite),
      findMembership: ma({ role: 'MEMBER' }),
    });

    await expect(service.accept('valid-token', 'user-1')).rejects.toThrow(AlreadyOrgMemberError);
  });
});

// ── revokeInvite() ─────────────────────────────────────────────────────────────

describe('InviteService.revokeInvite()', () => {
  it('throws InviteNotFoundError if invite does not exist', async () => {
    const { service } = buildService({ findInviteById: ma(null) });

    await expect(service.revokeInvite('invite-x', 'org-1')).rejects.toThrow(InviteNotFoundError);
  });

  it('throws InviteNotFoundError if invite belongs to different org (no info leak)', async () => {
    const { service } = buildService({
      findInviteById: ma({ id: 'invite-1', organizationId: 'org-OTHER' }),
    });

    await expect(service.revokeInvite('invite-1', 'org-1')).rejects.toThrow(InviteNotFoundError);
  });

  it('calls repo.revokeInvite on valid invite', async () => {
    const { service, repo } = buildService({
      findInviteById: ma({ id: 'invite-1', organizationId: 'org-1' }),
    });

    await service.revokeInvite('invite-1', 'org-1');

    expect(repo.revokeInvite).toHaveBeenCalledWith('invite-1');
  });
});
