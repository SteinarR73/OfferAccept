import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRoleGuard, REQUIRE_ORG_ROLE_KEY } from '../../src/modules/organizations/guards/org-role.guard';
import { OrgRepository } from '../../src/modules/organizations/org.repository';
import { NotOrgMemberError, InsufficientOrgRoleError } from '../../src/common/errors/domain.errors';

// ─── OrgRoleGuard unit tests ───────────────────────────────────────────────────
// Pure unit tests — no NestJS DI container.
// Mocks Reflector and OrgRepository directly.

function makeContext(
  user: { sub: string } | null,
  params: Record<string, string> = {},
): ExecutionContext {
  const req = { user, params };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('OrgRoleGuard', () => {
  let guard: OrgRoleGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let repo: jest.Mocked<Pick<OrgRepository, 'findMembership'>>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    repo = { findMembership: jest.fn() };
    guard = new OrgRoleGuard(
      reflector as unknown as Reflector,
      repo as unknown as OrgRepository,
    );
  });

  // ── No metadata — open route ────────────────────────────────────────────────

  it('returns true when @RequireOrgRole is not set on the handler', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = makeContext({ sub: 'user-1' }, { orgId: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(repo.findMembership).not.toHaveBeenCalled();
  });

  // ── Membership checks ───────────────────────────────────────────────────────

  it('allows access when caller is OWNER and ADMIN is required', async () => {
    reflector.getAllAndOverride.mockReturnValue('ADMIN');
    repo.findMembership.mockResolvedValue({ role: 'OWNER' } as never);

    const ctx = makeContext({ sub: 'user-1' }, { orgId: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(repo.findMembership).toHaveBeenCalledWith('user-1', 'org-1');
  });

  it('allows access when caller has exactly the required role (MEMBER)', async () => {
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    repo.findMembership.mockResolvedValue({ role: 'MEMBER' } as never);

    const ctx = makeContext({ sub: 'user-2' }, { orgId: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows VIEWER when VIEWER role is required', async () => {
    reflector.getAllAndOverride.mockReturnValue('VIEWER');
    repo.findMembership.mockResolvedValue({ role: 'VIEWER' } as never);

    const ctx = makeContext({ sub: 'user-3' }, { orgId: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws InsufficientOrgRoleError when caller is MEMBER but ADMIN is required', async () => {
    reflector.getAllAndOverride.mockReturnValue('ADMIN');
    repo.findMembership.mockResolvedValue({ role: 'MEMBER' } as never);

    const ctx = makeContext({ sub: 'user-2' }, { orgId: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InsufficientOrgRoleError);
  });

  it('throws InsufficientOrgRoleError when caller is VIEWER but MEMBER is required', async () => {
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    repo.findMembership.mockResolvedValue({ role: 'VIEWER' } as never);

    const ctx = makeContext({ sub: 'user-3' }, { orgId: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InsufficientOrgRoleError);
  });

  it('throws InsufficientOrgRoleError when caller is ADMIN but OWNER is required', async () => {
    reflector.getAllAndOverride.mockReturnValue('OWNER');
    repo.findMembership.mockResolvedValue({ role: 'ADMIN' } as never);

    const ctx = makeContext({ sub: 'user-4' }, { orgId: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InsufficientOrgRoleError);
  });

  // ── Not a member ────────────────────────────────────────────────────────────

  it('throws NotOrgMemberError when user has no membership in the org', async () => {
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    repo.findMembership.mockResolvedValue(null);

    const ctx = makeContext({ sub: 'user-5' }, { orgId: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotOrgMemberError);
  });

  // ── Missing request context ─────────────────────────────────────────────────

  it('throws NotOrgMemberError when user is not set on the request', async () => {
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    const ctx = makeContext(null, { orgId: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotOrgMemberError);
  });

  it('throws NotOrgMemberError when orgId param is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue('MEMBER');
    const ctx = makeContext({ sub: 'user-1' }, {}); // no :orgId param
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotOrgMemberError);
  });

  // ── Reflector key ───────────────────────────────────────────────────────────

  it('reads metadata using the correct REQUIRE_ORG_ROLE_KEY key', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = makeContext({ sub: 'user-1' }, { orgId: 'org-1' });
    await guard.canActivate(ctx);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(REQUIRE_ORG_ROLE_KEY, expect.any(Array));
  });
});
