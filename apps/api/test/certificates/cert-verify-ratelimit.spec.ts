import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CertificatesController } from '../../src/modules/certificates/certificates.controller';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';

// ─── Certificate verify — rate limit headers tests ─────────────────────────────
//
// Verifies that GET /certificates/:id/verify sets:
//   X-RateLimit-Limit     — always 10 (cert_verify profile limit)
//   X-RateLimit-Remaining — current remaining count from rateLimiter.peek()
//   X-RateLimit-Reset     — Unix timestamp (seconds) when the window resets
//
// Also verifies that no sensitive data leaks through the response body.

const CERT_ID = 'cert-verify-1';

function makeVerifyResult() {
  return {
    certificateId: CERT_ID,
    valid: true,
    certificateHashMatch: true,
    reconstructedHash: 'abc123',
    storedHash: 'abc123',
    snapshotIntegrity: true,
    eventChainValid: true,
    brokenAtSequence: undefined,
    anomaliesDetected: [],
  };
}

function buildMockReq(ip = '203.0.113.1') {
  return {
    socket: { remoteAddress: ip },
    headers: {},
  };
}

function buildMockRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((key: string, value: string) => { headers[key] = value; }),
    _headers: headers,
  };
}

async function buildController() {
  const certSvcMock = {
    verify: jest.fn<() => Promise<ReturnType<typeof makeVerifyResult>>>().mockResolvedValue(makeVerifyResult()),
  };

  const resetAt = new Date(Date.now() + 60_000);
  const rateLimiterMock = {
    check: jest.fn(),
    peek: jest.fn().mockReturnValue({ remaining: 7, resetAt }),
    _resetAt: resetAt,
  };

  const module = await Test.createTestingModule({
    controllers: [CertificatesController],
    providers: [
      { provide: CertificateService, useValue: certSvcMock },
      { provide: RateLimitService, useValue: rateLimiterMock },
      { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
      { provide: ConfigService, useValue: { getOrThrow: (_key: string) => 'https://app.test' } },
    ],
  }).compile();

  return {
    controller: module.get(CertificatesController),
    certSvc: certSvcMock,
    rateLimiter: rateLimiterMock,
  };
}

describe('CertificatesController.verifyCertificate() — rate limit headers', () => {
  it('sets X-RateLimit-Limit to 10', async () => {
    const { controller, rateLimiter } = await buildController();
    const req = buildMockReq();
    const res = buildMockRes();

    await controller.verifyCertificate(CERT_ID, req as never, res as never);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
  });

  it('sets X-RateLimit-Remaining from rateLimiter.peek()', async () => {
    const { controller, rateLimiter } = await buildController();
    const req = buildMockReq();
    const res = buildMockRes();

    await controller.verifyCertificate(CERT_ID, req as never, res as never);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '7');
  });

  it('sets X-RateLimit-Reset as a Unix timestamp (seconds)', async () => {
    const { controller, rateLimiter } = await buildController();
    const req = buildMockReq();
    const res = buildMockRes();

    await controller.verifyCertificate(CERT_ID, req as never, res as never);

    const expectedReset = String(Math.ceil(rateLimiter._resetAt.getTime() / 1000));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expectedReset);
  });

  it('calls rateLimiter.peek() with the cert_verify profile and client IP', async () => {
    const { controller, rateLimiter } = await buildController();
    const req = buildMockReq('10.0.0.55');
    const res = buildMockRes();

    await controller.verifyCertificate(CERT_ID, req as never, res as never);

    expect(rateLimiter.peek).toHaveBeenCalledWith('cert_verify', '10.0.0.55');
  });

  it('response body contains no sensitive data (no email, no IP, no statement)', async () => {
    const { controller } = await buildController();
    const req = buildMockReq();
    const res = buildMockRes();

    const body = await controller.verifyCertificate(CERT_ID, req as never, res as never);

    const bodyKeys = Object.keys(body as object);
    const forbidden = ['email', 'ipAddress', 'userAgent', 'acceptanceStatement', 'canonicalJson'];
    for (const key of forbidden) {
      expect(bodyKeys).not.toContain(key);
    }
  });

  it('calls rateLimiter.check() before peek() and verify()', async () => {
    const { controller, rateLimiter, certSvc } = await buildController();
    const callOrder: string[] = [];
    rateLimiter.check.mockImplementation(() => { callOrder.push('check'); });
    rateLimiter.peek.mockImplementation(() => { callOrder.push('peek'); return { remaining: 9, resetAt: new Date() }; });
    (certSvc.verify as jest.Mock).mockImplementation(async () => { callOrder.push('verify'); return makeVerifyResult(); });

    const req = buildMockReq();
    const res = buildMockRes();
    await controller.verifyCertificate(CERT_ID, req as never, res as never);

    expect(callOrder[0]).toBe('check');
    expect(callOrder).toContain('peek');
    expect(callOrder).toContain('verify');
  });
});
