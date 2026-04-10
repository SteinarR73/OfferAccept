import { Injectable } from '@nestjs/common';
import type { RateLimiterBackend } from './rate-limiter.backend';

// ─── MemoryRateLimiterBackend ──────────────────────────────────────────────────
// In-process sliding-window implementation for development and testing.
//
// Data structure: Map<key, number[]> where the array holds sorted request
// timestamps (Unix ms). On each operation, expired timestamps are pruned
// before counting.
//
// NOT suitable for multi-process deployments — limits are per-process.
// Use RedisRateLimiterBackend in production (RATE_LIMIT_BACKEND=redis).

@Injectable()
export class MemoryRateLimiterBackend implements RateLimiterBackend {
  private readonly windows = new Map<string, number[]>();

  checkRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
    _member: string,
  ): Promise<[number, number, number]> {
    const cutoff = now - windowMs;
    let timestamps = (this.windows.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= limit) {
      const resetAtMs = timestamps[0] + windowMs;
      return Promise.resolve([0, 0, resetAtMs]);
    }

    timestamps = [...timestamps, now].sort((a, b) => a - b);
    this.windows.set(key, timestamps);

    const remaining = limit - timestamps.length;
    return Promise.resolve([1, remaining, now + windowMs]);
  }

  peekRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<[number, number]> {
    const cutoff = now - windowMs;
    const timestamps = (this.windows.get(key) ?? []).filter((t) => t > cutoff);
    const remaining = Math.max(0, limit - timestamps.length);
    const resetAtMs = timestamps.length > 0 ? timestamps[0] + windowMs : now + windowMs;
    return Promise.resolve([remaining, resetAtMs]);
  }

  /** Clear all windows — useful in tests between cases. */
  clear(): void {
    this.windows.clear();
  }
}
