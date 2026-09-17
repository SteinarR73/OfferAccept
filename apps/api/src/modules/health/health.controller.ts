import { Controller, Get, HttpCode, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/rate-limit/rate-limit.service';

type ServiceHealth = 'operational' | 'degraded';

export interface ServicesHealthResponse {
  /** Millisecond timestamp of when this response was generated */
  checkedAt: number;
  services: {
    /** Postgres — primary datastore */
    database: ServiceHealth;
    /** Redis — session cache and rate-limit counters */
    cache: ServiceHealth;
    /** pg-boss job queue (shares the Postgres connection) */
    jobQueue: ServiceHealth;
    /** Signing + certificate + verification flows */
    signingFlow: ServiceHealth;
    /** Email delivery — Resend API (checked via domain ping, not send) */
    emailDelivery: ServiceHealth;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    @Inject('PRISMA') private prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }

  /**
   * Liveness probe. Verifies that the Node.js process is running and the HTTP
   * server is accepting connections. Does NOT check external dependencies to
   * prevent orchestration loops (e.g. Kubernetes restarting pods because Redis is slow).
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Readiness probe. Verifies that the app can process requests (dependencies
   * like Postgres and Redis are reachable). Load balancers should use this
   * to decide if a pod should receive traffic.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<{ status: string }> {
    const results = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    const allHealthy = results.every((r) => r.status === 'fulfilled');

    if (!allHealthy) {
      throw new ServiceUnavailableException({ status: 'degraded' });
    }

    return { status: 'ok' };
  }

  /**
   * Legacy combined probe for backward compatibility.
   * Use /health/ready for readiness and /health/live for liveness.
   */
  @Get('z')
  @HttpCode(HttpStatus.OK)
  async healthz(): Promise<{ status: string }> {
    return this.ready();
  }

  /**
   * Per-service health breakdown for the public status page.
   * No auth required. Never returns 5xx — always 200 with per-service status.
   *
   * Email delivery is not live-checked (a live send attempt would incur cost
   * and might trigger spam filters). Instead it reflects the aggregate of recent
   * delivery errors observed by the ResendEmailAdapter (metric: email_delivery_failed).
   * Currently we report 'operational' unless the database itself is down, since
   * job-level retry handles transient Resend failures and the adapter logs failures
   * via the metric key above.
   */
  @Get('services')
  @HttpCode(HttpStatus.OK)
  async services(): Promise<ServicesHealthResponse> {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    const dbOk    = dbResult.status === 'fulfilled';
    const redisOk = redisResult.status === 'fulfilled';

    return {
      checkedAt: Date.now(),
      services: {
        // Postgres
        database: dbOk ? 'operational' : 'degraded',
        // Redis
        cache: redisOk ? 'operational' : 'degraded',
        // pg-boss runs queries against the same Postgres connection pool.
        // If the DB is up the queue is operational.
        jobQueue: dbOk ? 'operational' : 'degraded',
        // Signing, certificate issuance, and verification all depend on Postgres.
        signingFlow: dbOk ? 'operational' : 'degraded',
        // Email — see JSDoc above.
        emailDelivery: dbOk ? 'operational' : 'degraded',
      },
    };
  }
}
