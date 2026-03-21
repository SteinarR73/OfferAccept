import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RateLimitService, REDIS_CLIENT } from './rate-limit.service';
import type { Env } from '../../config/env';

// ─── RateLimitModule ──────────────────────────────────────────────────────────
// Global module. Provides:
//   REDIS_CLIENT     — shared ioredis instance (all modules may inject if needed)
//   RateLimitService — sliding-window rate limiter backed by Redis
//
// Redis connection:
//   URL from REDIS_URL env var. All API pods must point to the same Redis
//   instance so per-IP / per-token limits are globally consistent.
//
// The ioredis client reconnects automatically on disconnect (default settings).
// Errors are logged but do not throw — the rate limiter fails open so that
// a Redis outage does not take down the entire API.

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

        // Enable TLS if the URL uses rediss:// or if REDIS_TLS=true is set.
        // External/managed Redis (Upstash, Elasticache) requires TLS. Enabling it
        // for a non-TLS server will cause connection failures, so only set this
        // when the remote endpoint actually requires it.
        const useTls = forceTls || url.startsWith('rediss://');

        const client = new Redis(url, {
          tls: useTls ? {} : undefined,
          // Sub-second timeouts: Redis errors must not add significant API latency.
          connectTimeout,
          commandTimeout,
          // Retry failed connections with exponential backoff, up to 30 s.
          retryStrategy: (times: number) => Math.min(times * 200, 30_000),
          // Do not crash the process on connection errors — let retryStrategy handle it.
          enableOfflineQueue: true,
          // Prevent memory growth during outages: commands queued while offline
          // are attempted once reconnected.
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
    RateLimitService,
  ],
  exports: [RateLimitService, REDIS_CLIENT],
})
export class RateLimitModule {}
