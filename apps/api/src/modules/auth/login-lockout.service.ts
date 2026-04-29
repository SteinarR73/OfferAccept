import * as crypto from 'crypto';
import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/rate-limit/rate-limit.service';

// ─── LoginLockoutService ──────────────────────────────────────────────────────
// Per-email brute-force protection, stored in Redis.
//
// Key: login_lockout:<sha256(normalised_email)>
// Hash fields:
//   attempts    — cumulative failed login count (integer string)
//   lockedUntil — Unix ms timestamp when the lockout lifts (0 = not locked)
//
// Policy:
//   - First MAX_ATTEMPTS−1 failures: no lockout, just count.
//   - On the Nth failure: lock for 2^(attempts − MAX_ATTEMPTS) minutes,
//     capped at MAX_LOCKOUT_MINUTES. Each subsequent failure extends the window.
//   - On successful login: counter is cleared immediately.
//   - Keys auto-expire after KEY_TTL_SECONDS of inactivity.
//
// This is per-email (not per-IP), so an attacker using rotating IPs is still
// blocked after MAX_ATTEMPTS guesses against a single account.

const MAX_ATTEMPTS       = 5;
const MAX_LOCKOUT_MINUTES = 60;
const KEY_TTL_SECONDS    = 24 * 60 * 60; // 24h inactivity → auto-clear

@Injectable()
export class LoginLockoutService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(email: string): Promise<void> {
    const key = lockoutKey(email);
    const lockedUntilRaw = await this.redis.hget(key, 'lockedUntil');
    const lockedUntil = lockedUntilRaw ? parseInt(lockedUntilRaw, 10) : 0;

    if (lockedUntil > Date.now()) {
      const retryAfterSeconds = Math.ceil((lockedUntil - Date.now()) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Account temporarily locked due to too many failed login attempts. Try again in ${retryAfterSeconds} seconds.`,
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string): Promise<void> {
    const key = lockoutKey(email);
    const attempts = await this.redis.hincrby(key, 'attempts', 1);
    await this.redis.expire(key, KEY_TTL_SECONDS);

    if (attempts >= MAX_ATTEMPTS) {
      const exponent = attempts - MAX_ATTEMPTS; // 0, 1, 2, …
      const backoffMinutes = Math.min(Math.pow(2, exponent), MAX_LOCKOUT_MINUTES);
      const lockedUntil = Date.now() + backoffMinutes * 60 * 1000;
      await this.redis.hset(key, 'lockedUntil', String(lockedUntil));
    }
  }

  async clearFailures(email: string): Promise<void> {
    await this.redis.del(lockoutKey(email));
  }
}

function lockoutKey(email: string): string {
  const normalised = email.toLowerCase().trim();
  const hash = crypto.createHash('sha256').update(normalised).digest('hex');
  return `login_lockout:${hash}`;
}
