import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';
import { AuthTokenInvalidError } from '../../src/common/errors/domain.errors';

// ─── Email verification tests ──────────────────────────────────────────────────
//
// Verifies:
//   - verifyEmail calls authService.verifyEmail with the token
//   - Returns a success message on valid token
//   - AuthTokenInvalidError propagates for invalid/expired/already-used token
//   - resendVerification always returns 200 (anti-enumeration)

async function buildController() {
  const authSvcMock = {
    verifyEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    resendVerificationEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const rateLimiterMock = { check: jest.fn() };

  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authSvcMock },
      { provide: RateLimitService, useValue: rateLimiterMock },
      { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
    ],
  }).compile();

  return {
    controller: module.get(AuthController),
    authSvc: authSvcMock,
  };
}

describe('AuthController.verifyEmail()', () => {
  it('calls authService.verifyEmail with the provided token', async () => {
    const { controller, authSvc } = await buildController();
    await controller.verifyEmail({ token: 'raw-verify-token' } as never);
    expect(authSvc.verifyEmail).toHaveBeenCalledWith('raw-verify-token');
  });

  it('returns a success message on valid token', async () => {
    const { controller } = await buildController();
    const result = await controller.verifyEmail({ token: 'valid-token' } as never);
    expect(result).toHaveProperty('message');
    expect(typeof result.message).toBe('string');
  });

  it('propagates AuthTokenInvalidError for invalid token', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.verifyEmail as jest.Mock<(...args: any[]) => any>).mockRejectedValue(new AuthTokenInvalidError());

    await expect(
      controller.verifyEmail({ token: 'bad-token' } as never),
    ).rejects.toThrow(AuthTokenInvalidError);
  });

  it('propagates AuthTokenInvalidError for already-used token', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.verifyEmail as jest.Mock<(...args: any[]) => any>).mockRejectedValue(new AuthTokenInvalidError());

    await expect(
      controller.verifyEmail({ token: 'used-token' } as never),
    ).rejects.toThrow(AuthTokenInvalidError);
  });
});

describe('AuthController.resendVerification()', () => {
  it('always returns 200 with a generic message', async () => {
    const { controller } = await buildController();
    const result = await controller.resendVerification({ email: 'anyone@example.com' } as never);
    expect(result).toHaveProperty('message');
    expect(typeof result.message).toBe('string');
  });

  it('returns 200 even when the email is not registered (anti-enumeration)', async () => {
    const { controller, authSvc } = await buildController();
    // The service handles unknown emails silently and returns void
    (authSvc.resendVerificationEmail as jest.Mock<(...args: any[]) => any>).mockResolvedValue(undefined);

    await expect(
      controller.resendVerification({ email: 'nobody@void.io' } as never),
    ).resolves.toBeDefined();
  });
});
