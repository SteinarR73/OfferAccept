// ─── RateLimiterBackend ────────────────────────────────────────────────────────
// Low-level storage interface for the sliding-window rate limiter.
//
// Two implementations:
//   RedisRateLimiterBackend  — production default; atomic Lua scripts, distributed
//   MemoryRateLimiterBackend — single-process; used in dev/test when Redis is unavailable
//
// RateLimitService owns all business logic (profiles, error handling, logging).
// Backends are responsible only for atomic read-modify-write on the window store.

export const RATE_LIMITER_BACKEND = 'RATE_LIMITER_BACKEND';

export interface RateLimiterBackend {
  /**
   * Atomic sliding-window check-and-increment.
   *
   * @returns [allowed, remaining, resetAtMs]
   *   allowed   — 1 if the request is within the limit, 0 if rate-limited
   *   remaining — slots remaining after this request (0 when denied)
   *   resetAtMs — Unix ms when the first slot in the current window opens again
   */
  checkRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
    member: string,
  ): Promise<[allowed: number, remaining: number, resetAtMs: number]>;

  /**
   * Read-only sliding-window peek (does not consume a slot).
   *
   * @returns [remaining, resetAtMs]
   */
  peekRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<[remaining: number, resetAtMs: number]>;
}
