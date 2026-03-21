import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';
import {
  AuthTokenInvalidError,
  SessionRevokedError,
} from '../../src/common/errors/domain.errors';

// ─── Token refresh tests ───────────────────────────────────────────────────────
//
// Verifies:
//   - Reads refreshToken from cookie, NOT request body
//   - Rotates: sets new accessToken and refreshToken cookies
//   - No token appears in response body
//   - AuthTokenInvalidError when cookie is missing
//   - SessionRevokedError propagates (possible replay attack)
//   - New cookies are set on successful rotation

const NEW_TOKENS = {
  accessToken: 'new.access.jwt',
  refreshToken: 'new-refresh-token',
  sessionId: 'new-session-1',
};

function buildMockReq(refreshCookie?: string) {
  return {
    socket: { remoteAddress: '1.2.3.4' },
    headers: {},
    secure: false,
    cookies: refreshCookie ? { refreshToken: refreshCookie } : {},
  };
}

function buildMockRes() {
  const setHeaders: Record<string, unknown> = {};
  const cookies: Record<string, { value: string; options: object }> = {};
  return {
    cookie: jest.fn((name: string, value: string, options: object) => {
      cookies[name] = { value, options };
    }),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    _cookies: cookies,
    _status: setHeaders,
  };
}

async function buildController() {
  const authSvcMock = {
    refresh: jest.fn<() => Promise<typeof NEW_TOKENS>>().mockResolvedValue(NEW_TOKENS),
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
  };
}

describe('AuthController.refresh()', () => {
  it('reads the refresh token from the cookie', async () => {
    const { controller, authSvc } = await buildController();
    const req = buildMockReq('old-refresh-token');

    await controller.refresh(req as never, buildMockRes() as never);

    expect(authSvc.refresh).toHaveBeenCalledWith('old-refresh-token', expect.any(Object));
  });

  it('sets new accessToken and refreshToken cookies on success', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.refresh(buildMockReq('old-refresh-token') as never, res as never);

    expect(res.cookie).toHaveBeenCalledWith('accessToken', NEW_TOKENS.accessToken, expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', NEW_TOKENS.refreshToken, expect.objectContaining({ httpOnly: true }));
  });

  it('response body does NOT contain tokens', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    const body = await controller.refresh(buildMockReq('old-refresh-token') as never, res as never);

    expect(JSON.stringify(body)).not.toContain(NEW_TOKENS.accessToken);
    expect(JSON.stringify(body)).not.toContain(NEW_TOKENS.refreshToken);
  });

  it('returns 401 when refreshToken cookie is missing', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.refresh(buildMockReq(undefined) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('propagates SessionRevokedError (replay attack detection)', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.refresh as jest.Mock).mockRejectedValue(new SessionRevokedError());

    await expect(
      controller.refresh(buildMockReq('replayed-token') as never, buildMockRes() as never),
    ).rejects.toThrow(SessionRevokedError);
  });

  it('propagates AuthTokenInvalidError for expired tokens', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.refresh as jest.Mock).mockRejectedValue(new AuthTokenInvalidError());

    await expect(
      controller.refresh(buildMockReq('expired-token') as never, buildMockRes() as never),
    ).rejects.toThrow(AuthTokenInvalidError);
  });
});
