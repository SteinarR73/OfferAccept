import { Injectable, Inject, Logger, OnApplicationShutdown } from '@nestjs/common';
import type Redis from 'ioredis';
import { RateLimitExceededError, RateLimitServiceUnavailableError } from '../errors/domain.errors';

export const REDIS_CLIENT = 'REDIS_CLIENT';

// ─── Redis-backed sliding window rate limiter ──────────────────────────────────
//
// Algorithm: Sorted-set sliding window log, executed atomically via Lua.
//
// Per-key data structure (Redis sorted set):
//   Key:    rl:{profile}:{scope}      e.g. rl:login_attempt:1.2.3.4
//   Member: "{now}:{random}"          unique ID per request (avoids collisions
//                                     at identical millisecond timestamps)
//   Score:  Unix timestamp in ms      used for range queries and pruning
//
// On every check() call, a single Lua script atomically:
//   1. Removes all members older than (now - windowMs)  — slides the window
//   2. Counts remaining members                          — current request count
//   3. If count >= limit → returns denied + earliest resetAt timestamp
//   4. Otherwise → ZADDs the new request and sets PEXPIRE
//
// Atomicity guarantee:
//   The Lua script runs as a single Redis command. No other client can observe
//   a partial state between steps 1–4. This prevents the TOCTOU race that would
//   exist with separate ZADD/ZCARD calls.
//
// Distributed consistency:
//   All API instances share one Redis instance (REDIS_URL). Counters are global
//   — horizontal scaling does not multiply effective limits.
//
// Failure mode — differentiated by risk profile:
//   HIGH_RISK profiles (OTP, login, signup): fail closed → 503 Service Unavailable.
//     Rationale: Redis downtime on these endpoints creates a brute-force bypass
//     window. A short outage is less harmful than unbounded credential-stuffing.
//     Callers receive a deterministic 503 with Retry-After semantics.
//   LOW_RISK profiles (cert verify, deal send, invite, resend, support tools): fail open.
//     Rationale: these endpoints carry no credential-guessing risk. Blocking
//     legitimate users during a Redis blip is more harmful than the abuse risk.
//     All fail-open events are logged and metered so operators can act promptly.
//
// Key expiry:
//   PEXPIRE is set to (windowMs + 1 s) after each successful request.
//   Idle keys self-delete, preventing unbounded memory growth in Redis.

// Named limit profiles. Callers reference a profile name for consistency.
export type RateLimitProfile =
  // Public signing flow
  | 'token_verification'     // 10 attempts per IP per 15 minutes
  | 'otp_issuance'           // 3 issuances per recipient token per hour
  | 'otp_verification'       // 10 attempts per IP per 15 minutes (defense in depth)
  | 'otp_verification_burst' // 3 per 10 s — catches rapid automated guessing
  | 'signing_global'         // 60 requests per IP per minute
  // Support staff actions — keyed by sessionId or actorId
  | 'support_resend_otp'     // 3 OTP resends per session per 5 minutes (per-session key)
  | 'support_resend_link'    // 5 link resends per actor per 10 minutes (per-actor key)
  // Public certificate verification
  | 'cert_verify'            // 10 verifications per IP per minute
  // Auth endpoints
  | 'login_attempt'          // 10 login attempts per IP per 15 minutes
  | 'login_attempt_burst'    // 3 per 10 s — catches credential-stuffing bursts
  | 'forgot_password'        // 3 reset requests per IP per hour
  | 'signup_attempt'         // 5 signups per IP per hour
  | 'signup_attempt_burst'   // 2 per 30 s — catches automated account creation
  | 'resend_verification'    // 3 resend-verification requests per IP per hour
  // Organisation / invite endpoints
  | 'invite_attempt'         // 10 invitations sent per actor (userId) per hour
  | 'invite_accept_attempt'  // 5 accept attempts per IP per 15 minutes
  // Deal sending — authenticated, keyed by orgId / userId
  | 'deal_send'              // 30 sends per org per hour
  | 'deal_resend';           // 15 resends per user per hour

export const PROFILES: Record<RateLimitProfile, { limit: number; windowMs: number }> = {
  token_verification:     { limit: 10, windowMs: 15 * 60 * 1000 },
  otp_issuance:           { limit: 3,  windowMs: 60 * 60 * 1000 },
  otp_verification:       { limit: 10, windowMs: 15 * 60 * 1000 },
  otp_verification_burst: { limit: 3,  windowMs:      10 * 1000 },
  signing_global:         { limit: 60, windowMs:      60 * 1000 },
  support_resend_otp:     { limit: 3,  windowMs:  5 * 60 * 1000 },
  support_resend_link:    { limit: 5,  windowMs: 10 * 60 * 1000 },
  cert_verify:            { limit: 10, windowMs:      60 * 1000 },
  login_attempt:          { limit: 10, windowMs: 15 * 60 * 1000 },
  login_attempt_burst:    { limit: 3,  windowMs:      10 * 1000 },
  forgot_password:        { limit: 3,  windowMs: 60 * 60 * 1000 },
  signup_attempt:         { limit: 5,  windowMs: 60 * 60 * 1000 },
  signup_attempt_burst:   { limit: 2,  windowMs:      30 * 1000 },
  resend_verification:    { limit: 3,  windowMs: 60 * 60 * 1000 },
  invite_attempt:         { limit: 10, windowMs: 60 * 60 * 1000 },
  invite_accept_attempt:  { limit: 5,  windowMs: 15 * 60 * 1000 },
  deal_send:              { limit: 30, windowMs: 60 * 60 * 1000 },
  deal_resend:            { limit: 15, windowMs: 60 * 60 * 1000 },
};

// ── High-risk profiles — fail closed when Redis is unavailable ─────────────────
//
// These profiles guard credential-sensitive endpoints. If Redis is down, we
// MUST NOT allow unlimited attempts. Return 503 so callers can retry later.

const HIGH_RISK_PROFILES: ReadonlySet<RateLimitProfile> = new Set<RateLimitProfile>([
  'otp_issuance',
  'otp_verification',
  'otp_verification_burst',
  'login_attempt',
  'login_attempt_burst',
  'forgot_password',
  'signup_attempt',
  'signup_attempt_burst',
]);

// ── Lua scripts ────────────────────────────────────────────────────────────────
//
// CHECK_SCRIPT: atomic sliding-window check-and-increment.
//
// KEYS[1]  — Redis key (sorted set)
// ARGV[1]  — limit          (integer, max requests per window)
// ARGV[2]  — windowMs       (integer, window size in milliseconds)
// ARGV[3]  — now            (integer, current Unix time in ms)
// ARGV[4]  — member         (string,  unique ID for this request)
//
// Returns array [allowed, remaining, resetAtMs]:
//   allowed   — 1 if request is permitted, 0 if rate-limited
//   remaining — number of remaining slots after this request (0 if denied)
//   resetAtMs — Unix ms when the oldest in-window request exits the window
//               (i.e., when the first slot opens up again)

const CHECK_SCRIPT = `
local key      = KEYS[1]
local limit    = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])
local member   = ARGV[4]
local cutoff   = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)

local count = tonumber(redis.call('ZCARD', key))

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAtMs = now + windowMs
  if oldest and #oldest >= 2 then
    resetAtMs = tonumber(oldest[2]) + windowMs
  end
  return {0, 0, resetAtMs}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs + 1000)

local remaining = limit - count - 1
return {1, remaining, now + windowMs}
`.trim();

// PEEK_SCRIPT: read-only sliding-window state (cleans expired entries but does not add).
//
// KEYS[1]  — Redis key
// ARGV[1]  — limit
// ARGV[2]  — windowMs
// ARGV[3]  — now
//
// Returns array [remaining, resetAtMs]

const PEEK_SCRIPT = `
local key      = KEYS[1]
local limit    = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])
local cutoff   = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)

local count    = tonumber(redis.call('ZCARD', key))
local oldest   = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetAtMs = now + windowMs

if oldest and #oldest >= 2 then
  resetAtMs = tonumber(oldest[2]) + windowMs
end

local remaining = math.max(0, limit - count)
return {remaining, resetAtMs}
`.trim();

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class RateLimitService implements OnApplicationShutdown {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Check and increment. Throws RateLimitExceededError if over limit.
  // key should be the raw scope value (e.g. an IP address or token hash).
  // The Redis key is constructed as: rl:{profile}:{key}
  async check(profile: RateLimitProfile, key: string): Promise<void> {
    const { limit, windowMs } = PROFILES[profile];
    const redisKey = `rl:${profile}:${key}`;
    const now = Date.now();
    // Unique member: timestamp + random suffix prevents collisions when multiple
    // requests arrive within the same millisecond from the same scope.
    const member = `${now}:${Math.random().toString(36).slice(2, 9)}`;

    let result: [number, number, number];
    try {
      result = (await this.redis.eval(
        CHECK_SCRIPT,
        1,
        redisKey,
        String(limit),
        String(windowMs),
        String(now),
        member,
      )) as [number, number, number];
    } catch (err) {
      const isHighRisk = HIGH_RISK_PROFILES.has(profile);
      // Metric: rate_limit_redis_error — monitor this to detect Redis instability.
      // Structured JSON so log aggregators can extract metric=rate_limit_redis_error.
      this.logger.error(
        JSON.stringify({
          metric: 'rate_limit_redis_error',
          profile,
          key,
          action: isHighRisk ? 'fail_closed' : 'fail_open',
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      if (isHighRisk) {
        // Fail closed: brute-force protection must not be bypassed during Redis outage.
        // Callers receive 503 with a deterministic Retry-After expectation.
        throw new RateLimitServiceUnavailableError();
      }

      // Fail open: low-risk endpoint — blocking legitimate users during a Redis
      // blip is more harmful than the marginal abuse risk. Operator is alerted
      // via the metric log above and must restore Redis promptly.
      return;
    }

    const [allowed, , resetAtMs] = result;

    if (!allowed) {
      const resetAt = new Date(resetAtMs);
      const retryAfterMs = Math.max(0, resetAtMs - now);
      // Metric: rate_limit_exceeded — alert if this fires > 50×/min sustained.
      // Sudden spike on otp_verification / login_attempt = active credential-stuffing.
      // Sustained hits on deal_send / invite_attempt = API abuse or runaway client.
      // Structured JSON so log aggregators can group by profile and build rate charts.
      this.logger.warn(
        JSON.stringify({
          metric: 'rate_limit_exceeded',
          profile,
          key,
          retryAfterMs,
        }),
      );
      throw new RateLimitExceededError(retryAfterMs, resetAt);
    }
  }

  // Peek without incrementing — for building response headers.
  async peek(profile: RateLimitProfile, key: string): Promise<{ remaining: number; resetAt: Date }> {
    const { limit, windowMs } = PROFILES[profile];
    const redisKey = `rl:${profile}:${key}`;
    const now = Date.now();

    try {
      const result = (await this.redis.eval(
        PEEK_SCRIPT,
        1,
        redisKey,
        String(limit),
        String(windowMs),
        String(now),
      )) as [number, number];

      return {
        remaining: result[0],
        resetAt: new Date(result[1]),
      };
    } catch (err) {
      // Metric: rate_limit_redis_error — same event as in check(), but from peek().
      // Alert on any occurrence — indicates Redis connectivity issues.
      this.logger.error(
        JSON.stringify({
          metric: 'rate_limit_redis_error',
          profile,
          key,
          action: 'peek_fail_open',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      // Fail-open: return full remaining count so callers can still serve headers.
      return { remaining: limit, resetAt: new Date(now + windowMs) };
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
