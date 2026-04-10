import { Test } from '@nestjs/testing';
import { RateLimitService, PROFILES } from '../../src/common/rate-limit/rate-limit.service';
import { MemoryRateLimiterBackend } from '../../src/common/rate-limit/memory-rate-limiter.backend';
import { RATE_LIMITER_BACKEND } from '../../src/common/rate-limit/rate-limiter.backend';
import { RateLimitExceededError } from '../../src/common/errors/domain.errors';

// ─── RateLimitService — unit tests ────────────────────────────────────────────
// Uses MemoryRateLimiterBackend so no Redis is needed.

describe('RateLimitService (memory backend)', () => {
  let service: RateLimitService;
  let backend: MemoryRateLimiterBackend;

  beforeEach(async () => {
    backend = new MemoryRateLimiterBackend();
    const module = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: RATE_LIMITER_BACKEND, useValue: backend },
      ],
    }).compile();
    service = module.get(RateLimitService);
  });

  afterEach(() => backend.clear());

  it('allows requests within the limit', async () => {
    for (let i = 0; i < PROFILES.cert_verify.limit; i++) {
      await expect(service.check('cert_verify', '1.2.3.4')).resolves.toBeUndefined();
    }
  });

  it('throws RateLimitExceededError when the limit is reached', async () => {
    const { limit } = PROFILES.cert_verify;
    for (let i = 0; i < limit; i++) {
      await service.check('cert_verify', '1.2.3.4');
    }
    await expect(service.check('cert_verify', '1.2.3.4')).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
  });

  it('uses separate buckets for different keys', async () => {
    const { limit } = PROFILES.cert_verify;
    for (let i = 0; i < limit; i++) {
      await service.check('cert_verify', '1.2.3.4');
    }
    // Different key — should not be limited
    await expect(service.check('cert_verify', '5.6.7.8')).resolves.toBeUndefined();
  });

  it('uses separate buckets for different profiles', async () => {
    const { limit } = PROFILES.login_attempt;
    for (let i = 0; i < limit; i++) {
      await service.check('login_attempt', '1.2.3.4');
    }
    // Different profile on same key — should not be limited
    await expect(service.check('cert_verify', '1.2.3.4')).resolves.toBeUndefined();
  });

  it('peek returns remaining count without consuming a slot', async () => {
    const { limit } = PROFILES.cert_verify;
    await service.check('cert_verify', '10.0.0.1');
    const { remaining } = await service.peek('cert_verify', '10.0.0.1');
    expect(remaining).toBe(limit - 1);
    // Second peek should return the same count
    const { remaining: remaining2 } = await service.peek('cert_verify', '10.0.0.1');
    expect(remaining2).toBe(limit - 1);
  });

  it('dpa_accept profile is defined with correct limits', () => {
    expect(PROFILES.dpa_accept).toEqual({ limit: 3, windowMs: 60 * 60 * 1000 });
  });

  it('dpa_accept profile check succeeds within limit', async () => {
    for (let i = 0; i < PROFILES.dpa_accept.limit; i++) {
      await expect(service.check('dpa_accept', 'user-123')).resolves.toBeUndefined();
    }
  });

  it('dpa_accept profile throws when limit exceeded', async () => {
    const { limit } = PROFILES.dpa_accept;
    for (let i = 0; i < limit; i++) {
      await service.check('dpa_accept', 'user-abc');
    }
    await expect(service.check('dpa_accept', 'user-abc')).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
  });

  describe('fail-open for low-risk profiles when backend throws', () => {
    it('does not throw when backend errors on cert_verify', async () => {
      jest.spyOn(backend, 'checkRaw').mockRejectedValueOnce(new Error('backend unavailable'));
      await expect(service.check('cert_verify', '1.2.3.4')).resolves.toBeUndefined();
    });

    it('does not throw when backend errors on deal_send', async () => {
      jest.spyOn(backend, 'checkRaw').mockRejectedValueOnce(new Error('backend unavailable'));
      await expect(service.check('deal_send', 'org-1')).resolves.toBeUndefined();
    });
  });

  describe('fail-closed for high-risk profiles when backend throws', () => {
    it('throws RateLimitServiceUnavailableError on otp_verification backend error', async () => {
      jest.spyOn(backend, 'checkRaw').mockRejectedValueOnce(new Error('backend unavailable'));
      const { RateLimitServiceUnavailableError } = await import(
        '../../src/common/errors/domain.errors'
      );
      await expect(service.check('otp_verification', '1.2.3.4')).rejects.toBeInstanceOf(
        RateLimitServiceUnavailableError,
      );
    });

    it('throws RateLimitServiceUnavailableError on login_attempt backend error', async () => {
      jest.spyOn(backend, 'checkRaw').mockRejectedValueOnce(new Error('backend unavailable'));
      const { RateLimitServiceUnavailableError } = await import(
        '../../src/common/errors/domain.errors'
      );
      await expect(service.check('login_attempt', '1.2.3.4')).rejects.toBeInstanceOf(
        RateLimitServiceUnavailableError,
      );
    });
  });
});

// ─── MemoryRateLimiterBackend — unit tests ────────────────────────────────────

describe('MemoryRateLimiterBackend', () => {
  let backend: MemoryRateLimiterBackend;

  beforeEach(() => {
    backend = new MemoryRateLimiterBackend();
  });

  it('allows requests within the window', async () => {
    const now = Date.now();
    const [allowed] = await backend.checkRaw('key', 3, 60_000, now, 'a');
    expect(allowed).toBe(1);
  });

  it('denies requests exceeding the limit', async () => {
    const now = Date.now();
    await backend.checkRaw('key', 2, 60_000, now, 'a');
    await backend.checkRaw('key', 2, 60_000, now + 1, 'b');
    const [allowed] = await backend.checkRaw('key', 2, 60_000, now + 2, 'c');
    expect(allowed).toBe(0);
  });

  it('allows new requests after the window expires', async () => {
    const now = Date.now();
    await backend.checkRaw('key', 1, 1000, now, 'a');
    // Simulate time advancing past the window
    const [allowed] = await backend.checkRaw('key', 1, 1000, now + 2000, 'b');
    expect(allowed).toBe(1);
  });

  it('clear() resets all windows', async () => {
    const now = Date.now();
    await backend.checkRaw('key', 1, 60_000, now, 'a');
    backend.clear();
    const [allowed] = await backend.checkRaw('key', 1, 60_000, now + 1, 'b');
    expect(allowed).toBe(1);
  });

  it('peek does not consume a slot', async () => {
    const now = Date.now();
    await backend.checkRaw('key', 3, 60_000, now, 'a');
    const [remaining1] = await backend.peekRaw('key', 3, 60_000, now);
    const [remaining2] = await backend.peekRaw('key', 3, 60_000, now);
    expect(remaining1).toBe(remaining2);
    expect(remaining1).toBe(2);
  });
});
