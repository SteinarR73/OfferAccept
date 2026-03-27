import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';
import { EmailAlreadyExistsError } from '../../src/common/errors/domain.errors';

// ─── Signup tests ──────────────────────────────────────────────────────────────
//
// Verifies:
//   - Successful signup returns 201 + message
//   - EmailAlreadyExistsError propagates (mapped to 409 by the exception filter)
//   - Rate limiter is called with 'signup_attempt' profile

function buildMockReq(ip = '1.2.3.4') {
  return { socket: { remoteAddress: ip }, headers: {} };
}

async function buildController() {
  const authSvcMock = {
    signup: jest.fn<() => Promise<{ userId: string; orgId: string }>>()
      .mockResolvedValue({ userId: 'u1', orgId: 'o1' }),
  };
  const rateLimiterMock = {
    check: jest.fn(),
  };

  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authSvcMock },
      { provide: RateLimitService, useValue: rateLimiterMock },
      { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
      { provide: ConfigService, useValue: { get: () => undefined } },
    ],
  }).compile();

  return {
    controller: module.get(AuthController),
    authSvc: authSvcMock,
    rateLimiter: rateLimiterMock,
  };
}

const validBody = {
  orgName: 'Acme Inc.',
  name: 'Alice',
  email: 'alice@acme.com',
  password: 'securepass123',
};

describe('AuthController.signup()', () => {
  it('returns a success message on valid signup', async () => {
    const { controller } = await buildController();
    const result = await controller.signup(validBody as never, buildMockReq() as never);
    expect(result).toHaveProperty('message');
    expect(typeof result.message).toBe('string');
  });

  it('calls authService.signup with the correct parameters', async () => {
    const { controller, authSvc } = await buildController();
    await controller.signup(validBody as never, buildMockReq() as never);

    expect(authSvc.signup).toHaveBeenCalledWith({
      orgName: 'Acme Inc.',
      userName: 'Alice',
      email: 'alice@acme.com',
      password: 'securepass123',
    });
  });

  it('calls rateLimiter.check with signup_attempt profile', async () => {
    const { controller, rateLimiter } = await buildController();
    await controller.signup(validBody as never, buildMockReq('5.6.7.8') as never);
    expect(rateLimiter.check).toHaveBeenCalledWith('signup_attempt', expect.any(String));
  });

  it('propagates EmailAlreadyExistsError (let exception filter handle it)', async () => {
    const { controller, authSvc } = await buildController();
    (authSvc.signup as jest.Mock<(...args: any[]) => any>).mockRejectedValue(new EmailAlreadyExistsError());

    await expect(
      controller.signup(validBody as never, buildMockReq() as never),
    ).rejects.toThrow(EmailAlreadyExistsError);
  });
});
