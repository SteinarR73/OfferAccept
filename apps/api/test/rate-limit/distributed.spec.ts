import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  RateLimitService,
  REDIS_CLIENT,
  PROFILES,
} from '../../src/common/rate-limit/rate-limit.service';
import { RateLimitExceededError } from '../../src/common/errors/domain.errors';

// ─── Distributed consistency tests ────────────────────────────────────────────
//
// Verifies that multiple API instances sharing one Redis instance enforce limits
// globally — requests across all pods count towards the same window.
//
// Simulation:
//   Two RateLimitService instances (Instance A and Instance B) are created with
//   the same FakeRedis store. This mirrors two pods sharing one Redis endpoint.
//
// Scenarios:
//   1. Basic distributed counting: A + B together hit the limit exactly
//   2. Instance B is rejected when A has already exhausted the window
//   3. Concurrent burst from both instances respects the shared limit
//   4. One instance's window expiry is visible to the other instance
//   5. Different keys on the same profile are independent across instances
//   6. Stripe-style burst: both instances see consistent limits at high rate

// ── Shared FakeRedis (mirrors the algorithm from sliding-window.spec.ts) ──────

interface SortedSetEntry {
  score: number;
  member: string;
}

class SharedFakeRedis {
  // Public so both instances read and write the same store
  readonly sets = new Map<string, SortedSetEntry[]>();

  private getSet(key: string): SortedSetEntry[] {
    if (!this.sets.has(key)) this.sets.set(key, []);
    return this.sets.get(key)!;
  }

  private zremrangebyscore(key: string, min: number, max: number): void {
    const set = this.getSet(key);
    this.sets.set(key, set.filter((e) => !(e.score >= min && e.score <= max)));
  }

  private zcard(key: string): number {
    return this.getSet(key).length;
  }

  private zrangeWithScores(key: string, start: number, stop: number): string[] {
    const sorted = [...this.getSet(key)].sort((a, b) => a.score - b.score);
    const slice = sorted.slice(start, stop === -1 ? undefined : stop + 1);
    const result: string[] = [];
    for (const e of slice) result.push(e.member, String(e.score));
    return result;
  }

  private zadd(key: string, score: number, member: string): void {
    this.getSet(key).push({ score, member });
  }

  eval(
    script: string,
    _numKeys: number,
    redisKey: string,
    ...args: string[]
  ): [number, number, number] | [number, number] {
    const isCheck = script.includes("redis.call('ZADD'");

    if (isCheck) {
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
        if (oldest.length >= 2) resetAtMs = parseInt(oldest[1], 10) + windowMs;
        return [0, 0, resetAtMs];
      }

      this.zadd(redisKey, now, member);
      return [1, limit - count - 1, now + windowMs];
    } else {
      const limit = parseInt(args[0], 10);
      const windowMs = parseInt(args[1], 10);
      const now = parseInt(args[2], 10);
      const cutoff = now - windowMs;

      this.zremrangebyscore(redisKey, -Infinity, cutoff);
      const count = this.zcard(redisKey);
      const oldest = this.zrangeWithScores(redisKey, 0, 0);
      let resetAtMs = now + windowMs;
      if (oldest.length >= 2) resetAtMs = parseInt(oldest[1], 10) + windowMs;

      return [Math.max(0, limit - count), resetAtMs];
    }
  }

  quit = jest.fn<() => Promise<'OK'>>().mockResolvedValue('OK');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function buildTwoInstances(): Promise<{
  instanceA: RateLimitService;
  instanceB: RateLimitService;
  sharedRedis: SharedFakeRedis;
}> {
  const sharedRedis = new SharedFakeRedis();

  const [moduleA, moduleB] = await Promise.all([
    Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: sharedRedis },
      ],
    }).compile(),
    Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: sharedRedis },
      ],
    }).compile(),
  ]);

  return {
    instanceA: moduleA.get(RateLimitService),
    instanceB: moduleB.get(RateLimitService),
    sharedRedis,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Distributed consistency — two instances, shared Redis', () => {
  it('requests from A and B together count towards the shared limit', async () => {
    const { instanceA, instanceB } = await buildTwoInstances();
    const profile = 'login_attempt';
    const { limit } = PROFILES[profile];
    const ip = '192.168.1.1';

    // Split requests evenly across both instances
    const half = Math.floor(limit / 2);
    const rest = limit - half;

    for (let i = 0; i < half; i++) await instanceA.check(profile, ip);
    for (let i = 0; i < rest; i++) await instanceB.check(profile, ip);

    // Both instances should now see the limit exhausted
    await expect(instanceA.check(profile, ip)).rejects.toThrow(RateLimitExceededError);
    await expect(instanceB.check(profile, ip)).rejects.toThrow(RateLimitExceededError);
  });

  it('Instance B is blocked when Instance A exhausts the window', async () => {
    const { instanceA, instanceB } = await buildTwoInstances();
    const profile = 'otp_issuance';
    const { limit } = PROFILES[profile];
    const token = 'recipient-token-abc';

    // Instance A uses up all slots
    for (let i = 0; i < limit; i++) await instanceA.check(profile, token);

    // Instance B is rejected immediately — no local state to bypass
    await expect(instanceB.check(profile, token)).rejects.toThrow(RateLimitExceededError);
  });

  it('total allowed requests never exceeds the limit regardless of which instance processes them', async () => {
    const { instanceA, instanceB } = await buildTwoInstances();
    const profile = 'signup_attempt';
    const { limit } = PROFILES[profile];
    const ip = '10.10.10.10';

    let allowed = 0;
    let denied = 0;

    // Alternate requests across instances — simulates load-balanced traffic
    for (let i = 0; i < limit * 3; i++) {
      const instance = i % 2 === 0 ? instanceA : instanceB;
      try {
        await instance.check(profile, ip);
        allowed++;
      } catch (e) {
        if (e instanceof RateLimitExceededError) denied++;
        else throw e;
      }
    }

    expect(allowed).toBe(limit);
    expect(denied).toBe(limit * 3 - limit);
  });

  it('window expiry on one instance is immediately visible to the other', async () => {
    const { instanceA, instanceB } = await buildTwoInstances();
    const profile = 'otp_issuance';
    const { limit, windowMs } = PROFILES[profile];
    const token = 'shared-token';

    const t0 = 3_000_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);

    for (let i = 0; i < limit; i++) await instanceA.check(profile, token);
    await expect(instanceB.check(profile, token)).rejects.toThrow(RateLimitExceededError);

    // Advance time — window expires
    jest.spyOn(Date, 'now').mockReturnValue(t0 + windowMs + 1);

    // Instance B can now proceed (shared Redis sees the expiry)
    await expect(instanceB.check(profile, token)).resolves.not.toThrow();

    jest.restoreAllMocks();
  });

  it('different IPs on the same profile are independent across instances', async () => {
    const { instanceA, instanceB } = await buildTwoInstances();
    const profile = 'login_attempt';
    const { limit } = PROFILES[profile];

    // Exhaust the limit for ip1 via Instance A
    for (let i = 0; i < limit; i++) await instanceA.check(profile, 'ip1');
    await expect(instanceB.check(profile, 'ip1')).rejects.toThrow(RateLimitExceededError);

    // ip2 is completely unaffected on both instances
    for (let i = 0; i < limit; i++) {
      await expect(instanceA.check(profile, 'ip2')).resolves.not.toThrow();
    }
    await expect(instanceA.check(profile, 'ip2')).rejects.toThrow(RateLimitExceededError);
    await expect(instanceB.check(profile, 'ip2')).rejects.toThrow(RateLimitExceededError);
  });

  it('peek() on Instance B reflects state written by Instance A', async () => {
    const { instanceA, instanceB } = await buildTwoInstances();
    const profile = 'cert_verify';
    const { limit } = PROFILES[profile];
    const ip = '77.77.77.77';

    // Instance A makes 3 requests
    for (let i = 0; i < 3; i++) await instanceA.check(profile, ip);

    // Instance B peek should see 3 consumed, limit-3 remaining
    const { remaining } = await instanceB.peek(profile, ip);
    expect(remaining).toBe(limit - 3);
  });

  it('concurrent burst: total allowed requests never exceeds limit', async () => {
    const { instanceA, instanceB } = await buildTwoInstances();
    const profile = 'cert_verify';
    const { limit } = PROFILES[profile];
    const ip = '99.99.99.99';

    // Fire limit*2 requests "simultaneously" — JS is single-threaded so this
    // tests sequential ordering, but the shared Redis store ensures atomicity
    const checks = Array.from({ length: limit * 2 }, (_, i) =>
      (i % 2 === 0 ? instanceA : instanceB).check(profile, ip).then(() => 'ok').catch(() => 'denied'),
    );

    const results = await Promise.all(checks);
    const okCount = results.filter((r) => r === 'ok').length;
    const deniedCount = results.filter((r) => r === 'denied').length;

    expect(okCount).toBe(limit);
    expect(deniedCount).toBe(limit);
  });
});
