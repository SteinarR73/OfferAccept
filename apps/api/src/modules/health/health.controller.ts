import { Controller, Get, HttpCode, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/rate-limit/rate-limit.service';

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
   * Simple liveness + dependency check for load balancers and uptime monitors.
   * No auth required. Returns 200 { status: "ok" } or 503 { status: "degraded" }.
   * Does not expose internal error details.
   */
  @Get('z')
  @HttpCode(HttpStatus.OK)
  async healthz(): Promise<{ status: string }> {
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
}
