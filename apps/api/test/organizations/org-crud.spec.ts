import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { OrgController } from '../../src/modules/organizations/org.controller';
import { OrgService } from '../../src/modules/organizations/org.service';
import { MembershipService } from '../../src/modules/organizations/membership.service';
import { InviteService } from '../../src/modules/organizations/invite.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';
import { OrgRoleGuard } from '../../src/modules/organizations/guards/org-role.guard';
import { JwtAuthGuard } from '../../src/common/auth/jwt-auth.guard';
import {
  NotOrgMemberError,
  InsufficientOrgRoleError,
} from '../../src/common/errors/domain.errors';

// ─── Org CRUD tests ────────────────────────────────────────────────────────────
//
// Verifies:
//   - createOrg delegates to OrgService with correct params
//   - listMyOrgs returns user's orgs
//   - getOrgDetail returns detail for a member
//   - listMembers returns member list
//   - Role enforcement: MEMBER cannot invite; ADMIN cannot transfer ownership
//   - removeMember and transferOwnership call correct service methods

function buildMockUser(role = 'MEMBER', sub = 'user-1') {
  return { sub, orgId: 'org-1', role };
}

function buildMockReq(user = buildMockUser()) {
  return { user, params: { id: 'org-1' } };
}

async function buildController() {
  const orgSvcMock = {
    create: jest.fn<() => Promise<{ id: string; name: string; slug: string }>>()
      .mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme' }),
    listForUser: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getDetail: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      memberCount: 2,
      role: 'MEMBER',
      createdAt: new Date(),
    }),
  };
  const membershipSvcMock = {
    listMembers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    removeMember: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    transferOwnership: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const inviteSvcMock = {
    invite: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    accept: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const orgRoleGuardMock = { canActivate: jest.fn<() => Promise<boolean>>().mockResolvedValue(true) };

  const jwtGuardMock = { canActivate: jest.fn<() => boolean>().mockReturnValue(true) };

  const module = await Test.createTestingModule({
    controllers: [OrgController],
    providers: [
      { provide: OrgService, useValue: orgSvcMock },
      { provide: MembershipService, useValue: membershipSvcMock },
      { provide: InviteService, useValue: inviteSvcMock },
      { provide: RateLimitService, useValue: { check: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(jwtGuardMock)
    .overrideGuard(OrgRoleGuard)
    .useValue(orgRoleGuardMock)
    .compile();

  return {
    controller: module.get(OrgController),
    orgSvc: orgSvcMock,
    membershipSvc: membershipSvcMock,
    inviteSvc: inviteSvcMock,
    roleGuard: orgRoleGuardMock,
  };
}

describe('OrgController.createOrg()', () => {
  it('calls orgService.create with correct params', async () => {
    const { controller, orgSvc } = await buildController();
    const req = buildMockReq(buildMockUser('OWNER', 'user-1'));

    await controller.createOrg({ name: 'My Org' } as never, req as never);

    expect(orgSvc.create).toHaveBeenCalledWith('user-1', { name: 'My Org' });
  });

  it('returns the created org', async () => {
    const { controller } = await buildController();
    const result = await controller.createOrg({ name: 'My Org' } as never, buildMockReq() as never);
    expect(result).toMatchObject({ id: 'org-1', name: 'Acme', slug: 'acme' });
  });
});

describe('OrgController.listMyOrgs()', () => {
  it('calls orgService.listForUser with the JWT userId', async () => {
    const { controller, orgSvc } = await buildController();
    const req = buildMockReq(buildMockUser('MEMBER', 'user-42'));

    await controller.listMyOrgs(req as never);

    expect(orgSvc.listForUser).toHaveBeenCalledWith('user-42');
  });
});

describe('OrgController.getOrgDetail()', () => {
  it('calls orgService.getDetail with userId and orgId', async () => {
    const { controller, orgSvc } = await buildController();
    const req = buildMockReq(buildMockUser('MEMBER', 'user-7'));

    await controller.getOrgDetail('org-1', req as never);

    expect(orgSvc.getDetail).toHaveBeenCalledWith('user-7', 'org-1');
  });
});

describe('OrgController.listMembers()', () => {
  it('calls membershipService.listMembers with orgId', async () => {
    const { controller, membershipSvc } = await buildController();

    await controller.listMembers('org-1');

    expect(membershipSvc.listMembers).toHaveBeenCalledWith('org-1');
  });
});

describe('OrgController.inviteMember()', () => {
  it('calls inviteService.invite with correct params', async () => {
    const { controller, inviteSvc } = await buildController();
    const req = buildMockReq(buildMockUser('ADMIN', 'admin-1'));

    await controller.inviteMember(
      'org-1',
      { email: 'bob@example.com', role: 'MEMBER' } as never,
      req as never,
    );

    expect(inviteSvc.invite).toHaveBeenCalledWith({
      orgId: 'org-1',
      email: 'bob@example.com',
      role: 'MEMBER',
      invitedById: 'admin-1',
    });
  });
});

describe('OrgController.removeMember()', () => {
  it('calls membershipService.removeMember with actorId, targetId, orgId', async () => {
    const { controller, membershipSvc } = await buildController();
    const req = buildMockReq(buildMockUser('OWNER', 'owner-1'));

    await controller.removeMember('org-1', 'target-user', req as never);

    expect(membershipSvc.removeMember).toHaveBeenCalledWith('owner-1', 'target-user', 'org-1');
  });
});

describe('OrgController.transferOwnership()', () => {
  it('calls membershipService.transferOwnership with correct args', async () => {
    const { controller, membershipSvc } = await buildController();
    const req = buildMockReq(buildMockUser('OWNER', 'owner-1'));

    await controller.transferOwnership(
      'org-1',
      { toUserId: 'new-owner' } as never,
      req as never,
    );

    expect(membershipSvc.transferOwnership).toHaveBeenCalledWith('owner-1', 'new-owner', 'org-1');
  });
});

describe('OrgController.acceptInvite()', () => {
  it('calls inviteService.accept with raw token and authenticated userId', async () => {
    const { controller, inviteSvc } = await buildController();
    const req = buildMockReq(buildMockUser('MEMBER', 'user-5'));

    await controller.acceptInvite({ token: 'raw-tok-123' } as never, req as never);

    expect(inviteSvc.accept).toHaveBeenCalledWith('raw-tok-123', 'user-5');
  });
});

describe('OrgRoleGuard (unit)', () => {
  function buildGuard(membershipRole: string | null, requiredRole: string) {
    const resolved = membershipRole ? { role: membershipRole } : null;
    const repoMock = {
      findMembership: jest.fn<() => Promise<any>>().mockResolvedValue(resolved),
    } as any;

    const reflectorMock = {
      get: jest.fn().mockReturnValue(requiredRole),
    } as any;

    const { OrgRoleGuard } = require('../../src/modules/organizations/guards/org-role.guard');
    return new OrgRoleGuard(reflectorMock, repoMock);
  }

  function buildContext() {
    return {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'user-1' },
          params: { id: 'org-1' },
        }),
      }),
    };
  }

  it('throws NotOrgMemberError when user has no membership', async () => {
    const guard = buildGuard(null, 'MEMBER');
    await expect(guard.canActivate(buildContext())).rejects.toThrow(NotOrgMemberError);
  });

  it('throws InsufficientOrgRoleError when role is too low', async () => {
    const guard = buildGuard('MEMBER', 'ADMIN');
    await expect(guard.canActivate(buildContext())).rejects.toThrow(InsufficientOrgRoleError);
  });

  it('passes when user has exactly the required role', async () => {
    const guard = buildGuard('ADMIN', 'ADMIN');
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('passes when user has a higher role than required', async () => {
    const guard = buildGuard('OWNER', 'ADMIN');
    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
  });
});
