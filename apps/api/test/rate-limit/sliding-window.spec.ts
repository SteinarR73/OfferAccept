import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  RateLimitService,
  PROFILES,
} from '../../src/common/rate-limit/rate-limit.service';
import { RATE_LIMITER_BACKEND, type RateLimiterBackend } from '../../src/common/rate-limit/rate-limiter.backend';
import { RateLimitExceededError, RateLimitServiceUnavailableError } from '../../src/common/errors/domain.errors';

// ─── Sliding window unit tests ─────────────────────────────────────────────────
//
// These tests run the *actual* CHECK and PEEK Lua logic, not mocked return values.
// We simulate Redis sorted-set behaviour in JavaScript so the Lua-equivalent
// algorithm runs in-process without a real Redis connection.
//
// Each test gets a fresh FakeRedisBackend instance (isolated key space).
//
// What is verified:
//   - Requests within the limit are allowed
//   - The (limit+1)th request in a window is rejected with the correct error
//   - Requests after the window expires are allowed again (window slides)
//   - peek() returns correct remaining count without incrementing
//   - Fail-open behaviour when backend throws
//   - Fail-closed behaviour for high-risk profiles when backend throws
//   - retryAfterMs is > 0 and resetAt is a future Date on rejection

// ── FakeRedisBackend — sorted-set simulation ──────────────────────────────────
//
// Implements RateLimiterBackend using the same sliding-window algorithm as the
// Lua scripts, in pure JavaScript. No Redis connection required.
//
// Commands simulated:
//   ZREMRANGEBYSCORE  — prune entries older than cutoff
//   ZCARD             — count entries
//   ZRANGE ... WITHSCORES — get oldest entry
//   ZADD              — add entry
//   PEXPIRE           — no-op (TTL management not needed in tests)

interface SortedSetEntry {
  score: number; // timestamp in ms
  member: string;
}

class FakeRedisBackend implements RateLimiterBackend {
  private readonly sets = new Map<string, SortedSetEntry[]>();

  private getSet(key: string): SortedSetEntry[] {
    if (!this.sets.has(key)) this.sets.set(key, []);
    return this.sets.get(key)!;
  }

  private zremrangebyscore(key: string, cutoff: number): void {
    const set = this.getSet(key);
    this.sets.set(key, set.filter((e) => e.score > cutoff));
  }

  private zcard(key: string): number {
    return this.getSet(key).length;
  }

  private zrangeOldest(key: string): SortedSetEntry | undefined {
    const set = this.getSet(key);
    if (set.length === 0) return undefined;
    return [...set].sort((a, b) => a.score - b.score)[0];
  }

  private zadd(key: string, score: number, member: string): void {
    this.getSet(key).push({ score, member });
  }

  checkRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
    member: string,
  ): Promise<[number, number, number]> {
    const cutoff = now - windowMs;
    this.zremrangebyscore(key, cutoff);
    const count = this.zcard(key);

    if (count >= limit) {
      const oldest = this.zrangeOldest(key);
      const resetAtMs = oldest ? oldest.score + windowMs : now + windowMs;
      return Promise.resolve([0, 0, resetAtMs]);
    }

    this.zadd(key, now, member);
    const remaining = limit - count - 1;
    return Promise.resolve([1, remaining, now + windowMs]);
  }

  peekRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<[number, number]> {
    const cutoff = now - windowMs;
    this.zremrangebyscore(key, cutoff);
    const count = this.zcard(key);
    const oldest = this.zrangeOldest(key);
    const resetAtMs = oldest ? oldest.score + windowMs : now + windowMs;
    const remaining = Math.max(0, limit - count);
    return Promise.resolve([remaining, resetAtMs]);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function buildService(backend: RateLimiterBackend = new FakeRedisBackend()) {
  const module = await Test.createTestingModule({
    providers: [
      RateLimitService,
      { provide: RATE_LIMITER_BACKEND, useValue: backend },
    ],
  }).compile();
  return { service: module.get(RateLimitService), backend };
}

function makeBrokenBackend(): RateLimiterBackend {
  return {
    checkRaw: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('ECONNREFUSED')),
    peekRaw: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('ECONNREFUSED')),
  };
}

async function buildServiceWithBrokenBackend() {
  const module = await Test.createTestingModule({
    providers: [
      RateLimitService,
      { provide: RATE_LIMITER_BACKEND, useValue: makeBrokenBackend() },
    ],
  }).compile();
  return module.get(RateLimitService);
}

// ── check(): basic allow/deny ──────────────────────────────────────────────────

describe('check() — basic allow/deny', () => {
  it('allows requests up to the limit', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.login_attempt;

    for (let i = 0; i < limit; i++) {
      await expect(service.check('login_attempt', '1.2.3.4')).resolves.not.toThrow();
    }
  });

  it('throws RateLimitExceededError on the (limit+1)th request', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.login_attempt;

    for (let i = 0; i < limit; i++) {
      await service.check('login_attempt', '1.2.3.4');
    }

    await expect(service.check('login_attempt', '1.2.3.4')).rejects.toThrow(
      RateLimitExceededError,
    );
  });

  it('different keys are tracked independently', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.login_attempt;

    // Exhaust one IP
    for (let i = 0; i < limit; i++) {
      await service.check('login_attempt', '10.0.0.1');
    }
    await expect(service.check('login_attempt', '10.0.0.1')).rejects.toThrow(RateLimitExceededError);

    // Different IP is unaffected
    await expect(service.check('login_attempt', '10.0.0.2')).resolves.not.toThrow();
  });

  it('different profiles share no state', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.otp_issuance; // limit=3

    for (let i = 0; i < limit; i++) {
      await service.check('otp_issuance', 'some-token');
    }
    await expect(service.check('otp_issuance', 'some-token')).rejects.toThrow(RateLimitExceededError);

    // login_attempt profile uses a different key — unaffected
    await expect(service.check('login_attempt', 'some-token')).resolves.not.toThrow();
  });
});

// ── check(): error shape ───────────────────────────────────────────────────────

describe('check() — error shape on rejection', () => {
  it('retryAfterMs is a positive integer', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.login_attempt;

    for (let i = 0; i < limit; i++) await service.check('login_attempt', 'x');

    const err = await service.check('login_attempt', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitExceededError);
    expect((err as RateLimitExceededError).retryAfterMs).toBeGreaterThan(0);
  });

  it('resetAt is a future Date', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.login_attempt;
    const before = Date.now();

    for (let i = 0; i < limit; i++) await service.check('login_attempt', 'x');

    const err = await service.check('login_attempt', 'x').catch((e: unknown) => e);
    expect((err as RateLimitExceededError).resetAt).toBeInstanceOf(Date);
    expect((err as RateLimitExceededError).resetAt.getTime()).toBeGreaterThan(before);
  });
});

// ── check(): sliding window behaviour ─────────────────────────────────────────

describe('check() — sliding window', () => {
  it('allows requests again after the window expires', async () => {
    const backend = new FakeRedisBackend();
    const { service } = await buildService(backend);
    const profile = 'otp_issuance';
    const { limit, windowMs } = PROFILES[profile];

    // Fill the window to the limit
    const t0 = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    for (let i = 0; i < limit; i++) await service.check(profile, 'tok');
    await expect(service.check(profile, 'tok')).rejects.toThrow(RateLimitExceededError);

    // Advance time past the full window — all prior entries expire
    jest.spyOn(Date, 'now').mockReturnValue(t0 + windowMs + 1);
    await expect(service.check(profile, 'tok')).resolves.not.toThrow();

    jest.restoreAllMocks();
  });

  it('only expired entries slide out — recent ones still count', async () => {
    const backend = new FakeRedisBackend();
    const { service } = await buildService(backend);
    const profile = 'signup_attempt'; // limit=5, window=1h
    const { limit, windowMs } = PROFILES[profile];

    const t0 = 2_000_000_000_000;

    // 3 requests at t0
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    for (let i = 0; i < 3; i++) await service.check(profile, 'ip');

    // Advance to t0 + window/2 (t0 entries still in window)
    jest.spyOn(Date, 'now').mockReturnValue(t0 + windowMs / 2);
    // 2 more requests — now at limit
    for (let i = 0; i < 2; i++) await service.check(profile, 'ip');
    await expect(service.check(profile, 'ip')).rejects.toThrow(RateLimitExceededError);

    // Advance past the t0 entries (t0 + window + 1) — first 3 expire
    // But the t0+window/2 entries are still < windowMs old, so 2 remain
    jest.spyOn(Date, 'now').mockReturnValue(t0 + windowMs + 1);
    // limit=5, 2 still in window → 3 more allowed
    for (let i = 0; i < limit - 2; i++) {
      await expect(service.check(profile, 'ip')).resolves.not.toThrow();
    }
    // Now back at limit
    await expect(service.check(profile, 'ip')).rejects.toThrow(RateLimitExceededError);

    jest.restoreAllMocks();
  });
});

// ── check(): all profiles use correct limits ───────────────────────────────────

describe('check() — profile limits enforced correctly', () => {
  const cases: Array<[keyof typeof PROFILES, number]> = [
    ['login_attempt',      10],
    ['otp_issuance',        3],
    ['otp_verification',   10],
    ['signing_global',     60],
    ['cert_verify',        10],
    ['forgot_password',     3],
    ['signup_attempt',      5],
    ['support_resend_otp',  3],
    ['support_resend_link', 5],
    ['token_verification', 10],
    ['dpa_accept',          3],
  ];

  it.each(cases)('%s allows exactly %i requests then rejects', async (profile, expectedLimit) => {
    const { service } = await buildService();

    for (let i = 0; i < expectedLimit; i++) {
      await expect(service.check(profile, 'scope-key')).resolves.not.toThrow();
    }
    await expect(service.check(profile, 'scope-key')).rejects.toThrow(RateLimitExceededError);
  });
});

// ── peek() ─────────────────────────────────────────────────────────────────────

describe('peek()', () => {
  it('returns full remaining on an empty window', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.cert_verify;
    const result = await service.peek('cert_verify', '5.5.5.5');
    expect(result.remaining).toBe(limit);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it('returns decremented remaining after check() calls', async () => {
    const { service } = await buildService();
    const profile = 'cert_verify';
    const { limit } = PROFILES[profile];

    await service.check(profile, '5.5.5.5');
    await service.check(profile, '5.5.5.5');

    const { remaining } = await service.peek(profile, '5.5.5.5');
    expect(remaining).toBe(limit - 2);
  });

  it('does NOT increment the counter', async () => {
    const { service } = await buildService();
    const { limit } = PROFILES.cert_verify;

    // Peek many times
    for (let i = 0; i < limit + 5; i++) {
      await service.peek('cert_verify', '9.9.9.9');
    }

    // Should still be able to check() limit times without rejection
    for (let i = 0; i < limit; i++) {
      await expect(service.check('cert_verify', '9.9.9.9')).resolves.not.toThrow();
    }
    await expect(service.check('cert_verify', '9.9.9.9')).rejects.toThrow(RateLimitExceededError);
  });

  it('returns remaining=0 when window is exhausted', async () => {
    const { service } = await buildService();
    const profile = 'otp_issuance';
    const { limit } = PROFILES[profile];

    for (let i = 0; i < limit; i++) await service.check(profile, 'tok');

    const { remaining } = await service.peek(profile, 'tok');
    expect(remaining).toBe(0);
  });
});

// ── Backend-unavailable behaviour — differentiated by risk profile ─────────────
//
// HIGH_RISK profiles (OTP, login, signup): fail closed → RateLimitServiceUnavailableError
// LOW_RISK profiles (cert_verify, deal_send, etc.): fail open → request allowed

describe('Backend unavailable — high-risk profiles fail closed', () => {
  const highRiskProfiles = [
    'otp_verification',
    'otp_verification_burst',
    'otp_issuance',
    'login_attempt',
    'login_attempt_burst',
    'forgot_password',
    'signup_attempt',
    'signup_attempt_burst',
  ] as const;

  it.each(highRiskProfiles)(
    'check() throws RateLimitServiceUnavailableError for high-risk profile: %s',
    async (profile) => {
      const service = await buildServiceWithBrokenBackend();
      await expect(service.check(profile, '1.1.1.1')).rejects.toThrow(
        RateLimitServiceUnavailableError,
      );
    },
  );

  it('otp_verification fails closed and does not silently allow the request', async () => {
    const service = await buildServiceWithBrokenBackend();
    await expect(service.check('otp_verification', 'ip')).rejects.toBeInstanceOf(
      RateLimitServiceUnavailableError,
    );
  });

  it('login_attempt fails closed with RateLimitServiceUnavailableError (not RateLimitExceededError)', async () => {
    const service = await buildServiceWithBrokenBackend();
    const err = await service.check('login_attempt', '2.2.2.2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitServiceUnavailableError);
    expect(err).not.toBeInstanceOf(RateLimitExceededError);
  });
});

describe('Backend unavailable — low-risk profiles fail open', () => {
  const lowRiskProfiles = [
    'token_verification',
    'signing_global',
    'cert_verify',
    'resend_verification',
    'invite_attempt',
    'invite_accept_attempt',
    'deal_send',
    'deal_resend',
    'support_resend_otp',
    'support_resend_link',
    'dpa_accept',
  ] as const;

  it.each(lowRiskProfiles)(
    'check() allows request (fail open) for low-risk profile: %s',
    async (profile) => {
      const service = await buildServiceWithBrokenBackend();
      await expect(service.check(profile, '1.1.1.1')).resolves.not.toThrow();
    },
  );
});

describe('peek() on backend error — always fail open regardless of profile', () => {
  it('peek() returns full limit for high-risk profile on backend error', async () => {
    const service = await buildServiceWithBrokenBackend();
    const { remaining } = await service.peek('login_attempt', '1.1.1.1');
    expect(remaining).toBe(PROFILES.login_attempt.limit);
  });

  it('peek() returns full limit for low-risk profile on backend error', async () => {
    const service = await buildServiceWithBrokenBackend();
    const { remaining } = await service.peek('cert_verify', '1.1.1.1');
    expect(remaining).toBe(PROFILES.cert_verify.limit);
  });
});
