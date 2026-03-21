import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { RateLimitExceededError } from '../errors/domain.errors';

// ─── In-process sliding window rate limiter ────────────────────────────────────
//
// Suitable for v1 single-process deployment. For multi-process or horizontally
// scaled deployments, replace the in-memory store with a Redis-backed
// implementation using the same interface.
//
// Sliding window algorithm:
//   - Each key tracks the start of its current window and the request count.
//   - On each check: if the window has expired, reset. Otherwise, increment.
//   - Throws RateLimitExceededError if count exceeds the limit.
//
// Keys are caller-controlled and should be scoped to an action:
//   "token_verify:{ip}"              token validation attempts per IP
//   "otp_issue:{tokenHash}"          OTP issuance per recipient
//   "otp_verify:{ip}"                OTP verification per IP (defense in depth)
//   "signing_global:{ip}"            general signing endpoint traffic per IP

interface WindowEntry {
  count: number;
  windowStart: number; // Date.now() at window creation
}

// Named limit profiles. Callers reference a profile name for consistency.
export type RateLimitProfile =
  // Public signing flow
  | 'token_verification'  // 10 attempts per IP per 15 minutes
  | 'otp_issuance'        // 3 issuances per recipient token per hour
  | 'otp_verification'    // 10 attempts per IP per 15 minutes (defense in depth)
  | 'signing_global'      // 60 requests per IP per minute
  // Support staff actions — keyed by sessionId or actorId
  | 'support_resend_otp'  // 3 OTP resends per session per 5 minutes (per-session key)
  | 'support_resend_link' // 5 link resends per actor per 10 minutes (per-actor key)
  // Public certificate verification
  | 'cert_verify'         // 10 verifications per IP per minute
  // Auth endpoints
  | 'login_attempt'       // 10 login attempts per IP per 15 minutes
  | 'forgot_password'     // 3 reset requests per IP per hour
  | 'signup_attempt';     // 5 signups per IP per hour

const PROFILES: Record<RateLimitProfile, { limit: number; windowMs: number }> = {
  token_verification:  { limit: 10, windowMs: 15 * 60 * 1000 },
  otp_issuance:        { limit: 3,  windowMs: 60 * 60 * 1000 },
  otp_verification:    { limit: 10, windowMs: 15 * 60 * 1000 },
  signing_global:      { limit: 60, windowMs:      60 * 1000 },
  support_resend_otp:  { limit: 3,  windowMs:  5 * 60 * 1000 },
  support_resend_link: { limit: 5,  windowMs: 10 * 60 * 1000 },
  cert_verify:         { limit: 10, windowMs:      60 * 1000 },
  login_attempt:       { limit: 10, windowMs: 15 * 60 * 1000 },
  forgot_password:     { limit: 3,  windowMs: 60 * 60 * 1000 },
  signup_attempt:      { limit: 5,  windowMs: 60 * 60 * 1000 },
};

@Injectable()
export class RateLimitService implements OnApplicationShutdown {
  private readonly store = new Map<string, WindowEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Prune stale entries every 5 minutes to prevent unbounded memory growth.
    // Max stale age is the longest window (1 hour).
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Check and increment. Throws RateLimitExceededError if over limit.
  // key should be pre-scoped: e.g. "token_verification:{ip}"
  check(profile: RateLimitProfile, key: string): void {
    const { limit, windowMs } = PROFILES[profile];
    const storeKey = `${profile}:${key}`;
    const now = Date.now();

    let entry = this.store.get(storeKey);

    if (!entry || now - entry.windowStart >= windowMs) {
      // New window
      entry = { count: 1, windowStart: now };
      this.store.set(storeKey, entry);
      return;
    }

    entry.count += 1;

    if (entry.count > limit) {
      const resetAt = new Date(entry.windowStart + windowMs);
      const retryAfterMs = resetAt.getTime() - now;
      throw new RateLimitExceededError(retryAfterMs, resetAt);
    }
  }

  // Peek without incrementing — for building response headers.
  peek(profile: RateLimitProfile, key: string): { remaining: number; resetAt: Date } {
    const { limit, windowMs } = PROFILES[profile];
    const storeKey = `${profile}:${key}`;
    const now = Date.now();
    const entry = this.store.get(storeKey);

    if (!entry || now - entry.windowStart >= windowMs) {
      return { remaining: limit, resetAt: new Date(now + windowMs) };
    }

    return {
      remaining: Math.max(0, limit - entry.count),
      resetAt: new Date(entry.windowStart + windowMs),
    };
  }

  onApplicationShutdown(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(): void {
    const maxWindowMs = Math.max(...Object.values(PROFILES).map((p) => p.windowMs));
    const cutoff = Date.now() - maxWindowMs;
    for (const [key, entry] of this.store) {
      if (entry.windowStart < cutoff) {
        this.store.delete(key);
      }
    }
  }
}
