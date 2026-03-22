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
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('OrgRoleGuard', () => {
  let guard: OrgRoleGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'get'>>;
  let repo: jest.Mocked<Pick<OrgRepository, 'findMembership'>>;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    repo = { findMembership: jest.fn() };
    guard = new OrgRoleGuard(
      reflector as unknown as Reflector,
      repo as unknown as OrgRepository,
    );
  });

  // ── No metadata — open route ────────────────────────────────────────────────

  it('returns true when @RequireOrgRole is not set on the handler', async () => {
    reflector.get.mockReturnValue(undefined);
    const ctx = makeContext({ sub: 'user-1' }, { id: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(repo.findMembership).not.toHaveBeenCalled();
  });

  // ── Membership checks ───────────────────────────────────────────────────────

  it('allows access when caller is OWNER and ADMIN is required', async () => {
    reflector.get.mockReturnValue('ADMIN');
    repo.findMembership.mockResolvedValue({ role: 'OWNER' } as never);

    const ctx = makeContext({ sub: 'user-1' }, { id: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(repo.findMembership).toHaveBeenCalledWith('user-1', 'org-1');
  });

  it('allows access when caller has exactly the required role (MEMBER)', async () => {
    reflector.get.mockReturnValue('MEMBER');
    repo.findMembership.mockResolvedValue({ role: 'MEMBER' } as never);

    const ctx = makeContext({ sub: 'user-2' }, { id: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows VIEWER when VIEWER role is required', async () => {
    reflector.get.mockReturnValue('VIEWER');
    repo.findMembership.mockResolvedValue({ role: 'VIEWER' } as never);

    const ctx = makeContext({ sub: 'user-3' }, { id: 'org-1' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws InsufficientOrgRoleError when caller is MEMBER but ADMIN is required', async () => {
    reflector.get.mockReturnValue('ADMIN');
    repo.findMembership.mockResolvedValue({ role: 'MEMBER' } as never);

    const ctx = makeContext({ sub: 'user-2' }, { id: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InsufficientOrgRoleError);
  });

  it('throws InsufficientOrgRoleError when caller is VIEWER but MEMBER is required', async () => {
    reflector.get.mockReturnValue('MEMBER');
    repo.findMembership.mockResolvedValue({ role: 'VIEWER' } as never);

    const ctx = makeContext({ sub: 'user-3' }, { id: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InsufficientOrgRoleError);
  });

  it('throws InsufficientOrgRoleError when caller is ADMIN but OWNER is required', async () => {
    reflector.get.mockReturnValue('OWNER');
    repo.findMembership.mockResolvedValue({ role: 'ADMIN' } as never);

    const ctx = makeContext({ sub: 'user-4' }, { id: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InsufficientOrgRoleError);
  });

  // ── Not a member ────────────────────────────────────────────────────────────

  it('throws NotOrgMemberError when user has no membership in the org', async () => {
    reflector.get.mockReturnValue('MEMBER');
    repo.findMembership.mockResolvedValue(null);

    const ctx = makeContext({ sub: 'user-5' }, { id: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotOrgMemberError);
  });

  // ── Missing request context ─────────────────────────────────────────────────

  it('throws NotOrgMemberError when user is not set on the request', async () => {
    reflector.get.mockReturnValue('MEMBER');
    const ctx = makeContext(null, { id: 'org-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotOrgMemberError);
  });

  it('throws NotOrgMemberError when orgId param is missing', async () => {
    reflector.get.mockReturnValue('MEMBER');
    const ctx = makeContext({ sub: 'user-1' }, {}); // no :id param
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotOrgMemberError);
  });

  // ── Reflector key ───────────────────────────────────────────────────────────

  it('reads metadata using the correct REQUIRE_ORG_ROLE_KEY key', async () => {
    reflector.get.mockReturnValue(undefined);
    const ctx = makeContext({ sub: 'user-1' }, { id: 'org-1' });
    await guard.canActivate(ctx);
    expect(reflector.get).toHaveBeenCalledWith(REQUIRE_ORG_ROLE_KEY, expect.any(Object));
  });
});
