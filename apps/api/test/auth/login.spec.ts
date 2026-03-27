import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';
import {
  InvalidCredentialsError,
  EmailNotVerifiedError,
} from '../../src/common/errors/domain.errors';

// ─── Login tests ───────────────────────────────────────────────────────────────
//
// Verifies:
//   - Successful login sets accessToken and refreshToken cookies
//   - Cookie SameSite is 'strict' (not 'lax' or 'none') — primary CSRF defence
//   - Cookie HttpOnly flag is set — XSS cannot read the token
//   - Returns no token in the response body (tokens are in cookies)
//   - Rate limiter is called before authService.login
//   - InvalidCredentialsError propagates
//   - EmailNotVerifiedError propagates

function buildMockReq(ip = '1.2.3.4') {
  return {
    socket: { remoteAddress: ip },
    headers: {},
    secure: false,
  };
}

function buildMockRes() {
  const cookies: Record<string, { value: string; options: object }> = {};
  return {
    cookie: jest.fn((name: string, value: string, options: object) => {
      cookies[name] = { value, options };
    }),
    _cookies: cookies,
  };
}

const TOKENS = {
  accessToken: 'access.jwt.token',
  refreshToken: 'raw-refresh-token',
  sessionId: 'session-1',
};

function buildConfigMock(overrides: { COOKIE_SECURE?: boolean; COOKIE_DOMAIN?: string } = {}) {
  return {
    get: (key: string) => {
      if (key === 'COOKIE_SECURE') return overrides.COOKIE_SECURE ?? false;
      if (key === 'COOKIE_DOMAIN') return overrides.COOKIE_DOMAIN;
      return undefined;
    },
  };
}

async function buildController(configOverrides: { COOKIE_SECURE?: boolean; COOKIE_DOMAIN?: string } = {}) {
  const authSvcMock = {
    login: jest.fn<() => Promise<typeof TOKENS>>().mockResolvedValue(TOKENS),
  };
  const rateLimiterMock = { check: jest.fn() };

  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authSvcMock },
      { provide: RateLimitService, useValue: rateLimiterMock },
      { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
      { provide: ConfigService, useValue: buildConfigMock(configOverrides) },
    ],
  }).compile();

  return {
    controller: module.get(AuthController),
    authSvc: authSvcMock,
    rateLimiter: rateLimiterMock,
  };
}

describe('AuthController.login()', () => {
  it('sets accessToken cookie on successful login', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenCalledWith('accessToken', TOKENS.accessToken, expect.objectContaining({ httpOnly: true }));
  });

  it('sets refreshToken cookie on successful login', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', TOKENS.refreshToken, expect.objectContaining({ httpOnly: true }));
  });

  // ── CSRF / SameSite assertions ──────────────────────────────────────────────
  //
  // SameSite=Strict is the primary CSRF defence. If this ever slips to 'lax' or
  // 'none', cross-site requests would silently start carrying the cookie and the
  // entire CSRF protection model collapses.
  //
  // These tests are intentionally precise: they reject 'lax' and 'none' by name,
  // not just "it's set to something". A future refactor that weakens SameSite
  // will fail loudly here rather than silently in production.

  it('accessToken cookie has sameSite=strict', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'accessToken',
      TOKENS.accessToken,
      expect.objectContaining({ sameSite: 'strict' }),
    );
  });

  it('refreshToken cookie has sameSite=strict', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      TOKENS.refreshToken,
      expect.objectContaining({ sameSite: 'strict' }),
    );
  });

  it('accessToken cookie does NOT have sameSite=lax or sameSite=none', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    const [, , opts] = (res.cookie as jest.Mock).mock.calls.find(([name]) => name === 'accessToken') as [string, string, Record<string, unknown>];
    expect(opts.sameSite).not.toBe('lax');
    expect(opts.sameSite).not.toBe('none');
  });

  it('refreshToken cookie does NOT have sameSite=lax or sameSite=none', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    const [, , opts] = (res.cookie as jest.Mock).mock.calls.find(([name]) => name === 'refreshToken') as [string, string, Record<string, unknown>];
    expect(opts.sameSite).not.toBe('lax');
    expect(opts.sameSite).not.toBe('none');
  });

  it('refreshToken cookie is path-scoped to /api/v1/auth/refresh', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      TOKENS.refreshToken,
      expect.objectContaining({ path: '/api/v1/auth/refresh' }),
    );
  });

  it('sets cookie domain when COOKIE_DOMAIN is configured', async () => {
    const { controller } = await buildController({ COOKIE_DOMAIN: '.example.com' });
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'accessToken',
      TOKENS.accessToken,
      expect.objectContaining({ domain: '.example.com' }),
    );
  });

  it('omits domain attribute when COOKIE_DOMAIN is not configured', async () => {
    const { controller } = await buildController(); // no COOKIE_DOMAIN
    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    const [, , opts] = (res.cookie as jest.Mock).mock.calls.find(([name]) => name === 'accessToken') as [string, string, Record<string, unknown>];
    expect(opts).not.toHaveProperty('domain');
  });

  it('response body does NOT contain the access token', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    const body = await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(JSON.stringify(body)).not.toContain(TOKENS.accessToken);
    expect(JSON.stringify(body)).not.toContain(TOKENS.refreshToken);
  });

  it('calls rateLimiter.check with login_attempt before authService.login', async () => {
    const { controller, rateLimiter, authSvc } = await buildController();
    const callOrder: string[] = [];
    rateLimiter.check.mockImplementation(() => { callOrder.push('check'); });
    (authSvc.login as jest.Mock).mockImplementation(async () => { callOrder.push('login'); return TOKENS; });

    const res = buildMockRes();
    await controller.login(
      { email: 'alice@acme.com', password: 'pass' } as never,
      buildMockReq() as never,
      res as never,
    );

    expect(callOrder[0]).toBe('check');
    expect(callOrder).toContain('login');
  });

  it('propagates InvalidCredentialsError', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.login as jest.Mock<(...args: any[]) => any>).mockRejectedValue(new InvalidCredentialsError());

    await expect(
      controller.login(
        { email: 'x@x.com', password: 'bad' } as never,
        buildMockReq() as never,
        buildMockRes() as never,
      ),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('propagates EmailNotVerifiedError', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.login as jest.Mock<(...args: any[]) => any>).mockRejectedValue(new EmailNotVerifiedError());

    await expect(
      controller.login(
        { email: 'x@x.com', password: 'pass' } as never,
        buildMockReq() as never,
        buildMockRes() as never,
      ),
    ).rejects.toThrow(EmailNotVerifiedError);
  });
});
