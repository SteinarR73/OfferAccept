import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
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

async function buildController() {
  const authSvcMock = {
    login: jest.fn<() => Promise<typeof TOKENS>>().mockResolvedValue(TOKENS),
  };
  const rateLimiterMock = { check: jest.fn() };

  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authSvcMock },
      { provide: RateLimitService, useValue: rateLimiterMock },
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
    (authSvc.login as jest.Mock).mockRejectedValue(new InvalidCredentialsError());

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
    (authSvc.login as jest.Mock).mockRejectedValue(new EmailNotVerifiedError());

    await expect(
      controller.login(
        { email: 'x@x.com', password: 'pass' } as never,
        buildMockReq() as never,
        buildMockRes() as never,
      ),
    ).rejects.toThrow(EmailNotVerifiedError);
  });
});
