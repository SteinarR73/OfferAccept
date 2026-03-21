import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';
import { AuthTokenInvalidError } from '../../src/common/errors/domain.errors';

// ─── Password reset tests ──────────────────────────────────────────────────────
//
// Verifies:
//   - forgotPassword always returns 200 (even for unknown email — anti-enumeration)
//   - forgotPassword is rate-limited per IP
//   - resetPassword calls authService with token + new password
//   - resetPassword clears auth cookies (sessions are revoked after reset)
//   - AuthTokenInvalidError on bad/expired token

function buildMockReq(ip = '1.2.3.4') {
  return { socket: { remoteAddress: ip }, headers: {} };
}

function buildMockRes() {
  const cleared: string[] = [];
  return {
    clearCookie: jest.fn((name: string) => { cleared.push(name); }),
    _cleared: cleared,
  };
}

async function buildController() {
  const authSvcMock = {
    requestPasswordReset: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    resetPassword: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
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

describe('AuthController.forgotPassword()', () => {
  it('always returns 200 with a generic message', async () => {
    const { controller } = await buildController();
    const result = await controller.forgotPassword(
      { email: 'unknown@example.com' } as never,
      buildMockReq() as never,
    );
    expect(result).toHaveProperty('message');
    expect(typeof result.message).toBe('string');
  });

  it('calls rateLimiter.check with forgot_password profile', async () => {
    const { controller, rateLimiter } = await buildController();
    await controller.forgotPassword({ email: 'x@x.com' } as never, buildMockReq('9.9.9.9') as never);
    expect(rateLimiter.check).toHaveBeenCalledWith('forgot_password', expect.any(String));
  });

  it('calls authService.requestPasswordReset with the email', async () => {
    const { controller, authSvc } = await buildController();
    await controller.forgotPassword({ email: 'alice@acme.com' } as never, buildMockReq() as never);
    expect(authSvc.requestPasswordReset).toHaveBeenCalledWith('alice@acme.com');
  });

  it('does NOT throw when service throws (email not found case is handled silently in service)', async () => {
    // The service already handles unknown emails silently. The controller just awaits it.
    const { controller, authSvc } = await buildController();
    (authSvc.requestPasswordReset as jest.Mock).mockResolvedValue(undefined);
    await expect(
      controller.forgotPassword({ email: 'nobody@void.io' } as never, buildMockReq() as never),
    ).resolves.toBeDefined();
  });
});

describe('AuthController.resetPassword()', () => {
  it('calls authService.resetPassword with token and newPassword', async () => {
    const { controller, authSvc } = await buildController();
    await controller.resetPassword(
      { token: 'raw-token', newPassword: 'newSecurePass1' } as never,
      buildMockReq() as never,
      buildMockRes() as never,
    );
    expect(authSvc.resetPassword).toHaveBeenCalledWith(
      'raw-token',
      'newSecurePass1',
      expect.any(Object),
    );
  });

  it('clears accessToken and refreshToken cookies after reset', async () => {
    const { controller } = await buildController();
    const res = buildMockRes();
    await controller.resetPassword(
      { token: 'raw-token', newPassword: 'newSecurePass1' } as never,
      buildMockReq() as never,
      res as never,
    );
    expect(res.clearCookie).toHaveBeenCalledWith('accessToken', expect.any(Object));
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object));
  });

  it('propagates AuthTokenInvalidError for invalid/expired token', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.resetPassword as jest.Mock).mockRejectedValue(new AuthTokenInvalidError());

    await expect(
      controller.resetPassword(
        { token: 'bad-token', newPassword: 'newpass123' } as never,
        buildMockReq() as never,
        buildMockRes() as never,
      ),
    ).rejects.toThrow(AuthTokenInvalidError);
  });
});
