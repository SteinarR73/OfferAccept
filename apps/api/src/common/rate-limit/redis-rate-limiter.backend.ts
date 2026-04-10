import { Injectable, Inject, OnApplicationShutdown } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './rate-limit.service';
import type { RateLimiterBackend } from './rate-limiter.backend';

// ─── Lua scripts ───────────────────────────────────────────────────────────────
//
// CHECK_SCRIPT: atomic sliding-window check-and-increment.
//
// KEYS[1]  — Redis sorted set key
// ARGV[1]  — limit          (integer)
// ARGV[2]  — windowMs       (integer, ms)
// ARGV[3]  — now            (integer, Unix ms)
// ARGV[4]  — member         (string, unique request ID)
//
// Returns [allowed, remaining, resetAtMs].

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

// PEEK_SCRIPT: read-only sliding-window state.
//
// KEYS[1]  — Redis sorted set key
// ARGV[1]  — limit
// ARGV[2]  — windowMs
// ARGV[3]  — now
//
// Returns [remaining, resetAtMs].

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

// ─── RedisRateLimiterBackend ───────────────────────────────────────────────────

@Injectable()
export class RedisRateLimiterBackend implements RateLimiterBackend, OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }

  async checkRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
    member: string,
  ): Promise<[number, number, number]> {
    return (await this.redis.eval(
      CHECK_SCRIPT,
      1,
      key,
      String(limit),
      String(windowMs),
      String(now),
      member,
    )) as [number, number, number];
  }

  async peekRaw(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<[number, number]> {
    return (await this.redis.eval(
      PEEK_SCRIPT,
      1,
      key,
      String(limit),
      String(windowMs),
      String(now),
    )) as [number, number];
  }
}
