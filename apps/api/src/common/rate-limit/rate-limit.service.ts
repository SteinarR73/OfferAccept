import { Injectable, Inject, Logger } from '@nestjs/common';
import { RateLimitExceededError, RateLimitServiceUnavailableError } from '../errors/domain.errors';
import { RATE_LIMITER_BACKEND, type RateLimiterBackend } from './rate-limiter.backend';

export const REDIS_CLIENT = 'REDIS_CLIENT';

// ─── Redis-backed sliding window rate limiter ──────────────────────────────────
//
// Algorithm: Sorted-set sliding window log, executed atomically via Lua.
//
// See rate-limiter.backend.ts for the storage interface.
// See redis-rate-limiter.backend.ts for the Redis+Lua implementation.
// See memory-rate-limiter.backend.ts for the in-process dev/test implementation.
//
// Failure mode — differentiated by risk profile:
//   HIGH_RISK profiles (OTP, login, signup): fail closed → 503 Service Unavailable.
//   LOW_RISK profiles (cert verify, deal send, invite, etc.): fail open.
//
// Key format:  rl:{profile}:{scope}
// Backend is injected via RATE_LIMITER_BACKEND token (switched by RATE_LIMIT_BACKEND env var).

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
  | 'deal_resend'            // 15 resends per user per hour
  // GDPR account endpoints — authenticated, keyed by userId:ip
  | 'data_export'            // 5 exports per user per hour
  | 'erasure_request'        // 2 erasure requests per user per 24 hours
  // Bulk certificate export — authenticated, keyed by orgId:ip
  | 'bulk_cert_export'       // 3 bulk exports per org per hour
  // Enterprise / org settings — authenticated, keyed by userId
  | 'dpa_accept';            // 3 DPA acceptances per user per hour

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
  deal_send:              { limit: 30, windowMs:      60 * 60 * 1000 },
  deal_resend:            { limit: 15, windowMs:      60 * 60 * 1000 },
  data_export:            { limit: 5,  windowMs:      60 * 60 * 1000 },
  erasure_request:        { limit: 2,  windowMs: 24 * 60 * 60 * 1000 },
  bulk_cert_export:       { limit: 3,  windowMs:      60 * 60 * 1000 },
  dpa_accept:             { limit: 3,  windowMs:      60 * 60 * 1000 },
};

// ── High-risk profiles — fail closed when the backend is unavailable ───────────
//
// These profiles guard credential-sensitive endpoints. If the backend throws,
// we MUST NOT allow unlimited attempts. Return 503 so callers can retry later.

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

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    @Inject(RATE_LIMITER_BACKEND) private readonly backend: RateLimiterBackend,
  ) {}

  // Check and increment. Throws RateLimitExceededError if over limit.
  // key should be the raw scope value (e.g. an IP address or token hash).
  // The storage key is constructed as: rl:{profile}:{key}
  async check(profile: RateLimitProfile, key: string): Promise<void> {
    const { limit, windowMs } = PROFILES[profile];
    const storageKey = `rl:${profile}:${key}`;
    const now = Date.now();
    // Unique member: timestamp + random suffix prevents collisions when multiple
    // requests arrive within the same millisecond from the same scope.
    const member = `${now}:${Math.random().toString(36).slice(2, 9)}`;

    let result: [number, number, number];
    try {
      result = await this.backend.checkRaw(storageKey, limit, windowMs, now, member);
    } catch (err) {
      const isHighRisk = HIGH_RISK_PROFILES.has(profile);
      this.logger.error(
        JSON.stringify({
          metric: 'rate_limit_backend_error',
          profile,
          key,
          action: isHighRisk ? 'fail_closed' : 'fail_open',
          error: err instanceof Error ? err.message : String(err),
        }),
      );

      if (isHighRisk) {
        throw new RateLimitServiceUnavailableError();
      }

      // Fail open: low-risk endpoint.
      return;
    }

    const [allowed, , resetAtMs] = result;

    if (!allowed) {
      const resetAt = new Date(resetAtMs);
      const retryAfterMs = Math.max(0, resetAtMs - now);
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
    const storageKey = `rl:${profile}:${key}`;
    const now = Date.now();

    try {
      const result = await this.backend.peekRaw(storageKey, limit, windowMs, now);
      return {
        remaining: result[0],
        resetAt: new Date(result[1]),
      };
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          metric: 'rate_limit_backend_error',
          profile,
          key,
          action: 'peek_fail_open',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return { remaining: limit, resetAt: new Date(now + windowMs) };
    }
  }
}
