import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RateLimitService, REDIS_CLIENT } from './rate-limit.service';
import { RATE_LIMITER_BACKEND } from './rate-limiter.backend';
import { RedisRateLimiterBackend } from './redis-rate-limiter.backend';
import { MemoryRateLimiterBackend } from './memory-rate-limiter.backend';
import { ApiRateLimitGuard } from './api-rate-limit.guard';
import { AiRateLimitGuard } from './ai-rate-limit.guard';
import type { Env } from '../../config/env';

// ─── RateLimitModule ──────────────────────────────────────────────────────────
// Global module. Provides:
//   REDIS_CLIENT         — shared ioredis instance (all modules may inject if needed)
//   RATE_LIMITER_BACKEND — switched by RATE_LIMIT_BACKEND env var:
//                            redis  (default) → RedisRateLimiterBackend (distributed)
//                            memory           → MemoryRateLimiterBackend (single-process)
//   RateLimitService     — sliding-window rate limiter with business logic
//
// Use RATE_LIMIT_BACKEND=memory in development or tests that don't need Redis.
// NEVER use memory in production — limits are per-process only.

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService<Env, true>): Redis => {
        const logger = new Logger('Redis');
        const url = config.get('REDIS_URL', { infer: true });
        const forceTls = config.get('REDIS_TLS', { infer: true });
        const connectTimeout = config.get('REDIS_CONNECT_TIMEOUT_MS', { infer: true });
        const commandTimeout = config.get('REDIS_COMMAND_TIMEOUT_MS', { infer: true });

        const useTls = forceTls || url.startsWith('rediss://');

        const client = new Redis(url, {
          tls: useTls ? {} : undefined,
          connectTimeout,
          commandTimeout,
          retryStrategy: (times: number) => Math.min(times * 200, 30_000),
          enableOfflineQueue: true,
          maxRetriesPerRequest: null,
          lazyConnect: false,
        });

        client.on('connect', () => logger.log(`Redis connected: ${url}`));
        client.on('reconnecting', () => logger.warn('Redis reconnecting…'));
        client.on('error', (err: Error) =>
          logger.error(`Redis error: ${err.message}`),
        );

        return client;
      },
      inject: [ConfigService],
    },
    {
      provide: RATE_LIMITER_BACKEND,
      useFactory: (
        config: ConfigService<Env, true>,
        redis: Redis,
      ): RedisRateLimiterBackend | MemoryRateLimiterBackend => {
        const backend = config.get('RATE_LIMIT_BACKEND', { infer: true });
        if (backend === 'memory') {
          new Logger('RateLimitModule').warn(
            'RATE_LIMIT_BACKEND=memory — rate limits are per-process only. ' +
            'Do NOT use in production.',
          );
          return new MemoryRateLimiterBackend();
        }
        return new RedisRateLimiterBackend(redis);
      },
      inject: [ConfigService, REDIS_CLIENT],
    },
    RateLimitService,
    ApiRateLimitGuard,
    AiRateLimitGuard,
  ],
  exports: [RateLimitService, REDIS_CLIENT, ApiRateLimitGuard, AiRateLimitGuard],
})
export class RateLimitModule {}
