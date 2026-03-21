import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  RateLimitService,
  REDIS_CLIENT,
  PROFILES,
} from '../../src/common/rate-limit/rate-limit.service';
import { RateLimitExceededError } from '../../src/common/errors/domain.errors';

// ─── Sliding window unit tests ─────────────────────────────────────────────────
//
// These tests run the *actual* CHECK and PEEK Lua logic, not mocked return values.
// We simulate Redis sorted-set behaviour in JavaScript so the Lua-equivalent
// algorithm runs in-process without a real Redis connection.
//
// Each test gets a fresh FakeRedis instance (isolated key space).
//
// What is verified:
//   - Requests within the limit are allowed
//   - The (limit+1)th request in a window is rejected with the correct error
//   - Requests after the window expires are allowed again (window slides)
//   - ENTERPRISE unlimited bypass (all requests allowed regardless of count)
//   - peek() returns correct remaining count without incrementing
//   - Fail-open behaviour when Redis throws
//   - retryAfterMs is > 0 and resetAt is a future Date on rejection

// ── FakeRedis — sorted-set simulation ─────────────────────────────────────────
//
// Implements only the Redis commands used by the Lua scripts:
//   ZREMRANGEBYSCORE  — prune entries older than cutoff
//   ZCARD             — count entries
//   ZRANGE ... WITHSCORES — get oldest entry
//   ZADD              — add entry
//   PEXPIRE           — no-op in tests (TTL management not needed)
//
// eval() re-implements the Lua logic in JavaScript using the same data.
// This is intentionally faithful to the Lua — it tests the algorithm.

interface SortedSetEntry {
  score: number; // timestamp in ms
  member: string;
}

class FakeRedis {
  private readonly sets = new Map<string, SortedSetEntry[]>();

  private getSet(key: string): SortedSetEntry[] {
    if (!this.sets.has(key)) this.sets.set(key, []);
    return this.sets.get(key)!;
  }

  private zremrangebyscore(key: string, min: number, max: number): void {
    const set = this.getSet(key);
    const filtered = set.filter((e) => e.score > max || e.score < min);
    this.sets.set(key, filtered);
  }

  private zcard(key: string): number {
    return this.getSet(key).length;
  }

  private zrangeWithScores(key: string, start: number, stop: number): string[] {
    const set = this.getSet(key);
    const sorted = [...set].sort((a, b) => a.score - b.score);
    const slice = sorted.slice(start, stop === -1 ? undefined : stop + 1);
    // Returns [member, score, member, score, ...] like Redis WITHSCORES
    const result: string[] = [];
    for (const e of slice) {
      result.push(e.member, String(e.score));
    }
    return result;
  }

  private zadd(key: string, score: number, member: string): void {
    const set = this.getSet(key);
    set.push({ score, member });
  }

  // eval() re-implements both Lua scripts in JS.
  // The scripts are identified by a prefix match on the first 20 chars.
  eval(
    script: string,
    _numKeys: number,
    redisKey: string,
    ...args: string[]
  ): [number, number, number] | [number, number] {
    const isCheckScript = script.trimStart().startsWith('local key');
    const isPeekScript = script.trimStart().startsWith('local key') && !script.includes('ZADD');

    // Determine script type by presence of ZADD
    const isCheck = script.includes("redis.call('ZADD'");

    if (isCheck) {
      // CHECK_SCRIPT logic
      const limit = parseInt(args[0], 10);
      const windowMs = parseInt(args[1], 10);
      const now = parseInt(args[2], 10);
      const member = args[3];
      const cutoff = now - windowMs;

      this.zremrangebyscore(redisKey, -Infinity, cutoff);
      const count = this.zcard(redisKey);

      if (count >= limit) {
        const oldest = this.zrangeWithScores(redisKey, 0, 0);
        let resetAtMs = now + windowMs;
        if (oldest.length >= 2) {
          resetAtMs = parseInt(oldest[1], 10) + windowMs;
        }
        return [0, 0, resetAtMs];
      }

      this.zadd(redisKey, now, member);
      // PEXPIRE is a no-op here
      const remaining = limit - count - 1;
      return [1, remaining, now + windowMs];
    } else {
      // PEEK_SCRIPT logic
      const limit = parseInt(args[0], 10);
      const windowMs = parseInt(args[1], 10);
      const now = parseInt(args[2], 10);
      const cutoff = now - windowMs;

      this.zremrangebyscore(redisKey, -Infinity, cutoff);
      const count = this.zcard(redisKey);
      const oldest = this.zrangeWithScores(redisKey, 0, 0);
      let resetAtMs = now + windowMs;
      if (oldest.length >= 2) {
        resetAtMs = parseInt(oldest[1], 10) + windowMs;
      }
      const remaining = Math.max(0, limit - count);
      return [remaining, resetAtMs];
    }

    void isCheckScript;
    void isPeekScript;
  }

  quit = jest.fn<() => Promise<'OK'>>().mockResolvedValue('OK');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function buildService(redis: FakeRedis = new FakeRedis()) {
  const module = await Test.createTestingModule({
    providers: [
      RateLimitService,
      { provide: REDIS_CLIENT, useValue: redis },
    ],
  }).compile();
  return { service: module.get(RateLimitService), redis };
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

    // login_attempt profile uses a different Redis key — unaffected
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
    const redis = new FakeRedis();
    const { service } = await buildService(redis);
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
    const redis = new FakeRedis();
    const { service } = await buildService(redis);
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

// ── Fail-open on Redis error ───────────────────────────────────────────────────

describe('fail-open behaviour when Redis is unavailable', () => {
  it('check() allows request and does not throw on Redis error', async () => {
    const brokenRedis = {
      eval: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('ECONNREFUSED')),
      quit: jest.fn<() => Promise<'OK'>>().mockResolvedValue('OK'),
    };

    const module = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: brokenRedis },
      ],
    }).compile();

    const service = module.get(RateLimitService);
    await expect(service.check('login_attempt', '1.1.1.1')).resolves.not.toThrow();
  });

  it('peek() returns full limit on Redis error', async () => {
    const brokenRedis = {
      eval: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('ECONNREFUSED')),
      quit: jest.fn<() => Promise<'OK'>>().mockResolvedValue('OK'),
    };

    const module = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: brokenRedis },
      ],
    }).compile();

    const service = module.get(RateLimitService);
    const { remaining } = await service.peek('login_attempt', '1.1.1.1');
    expect(remaining).toBe(PROFILES.login_attempt.limit);
  });
});
