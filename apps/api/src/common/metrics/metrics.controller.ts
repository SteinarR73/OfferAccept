import { Controller, Get, Inject, Res, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from './metrics.service';
import type { Env } from '../../config/env';

// ─── MetricsController ────────────────────────────────────────────────────────
// GET /metrics — returns Prometheus text-format metrics.
//
// Access control: disabled by default. Set ENABLE_METRICS=true to expose.
// In production, combine with network-level access control (firewall / VPC rules)
// so only the metrics collector (Prometheus, Grafana Agent, etc.) can reach this
// endpoint — do NOT expose it to the public internet.
//
// The ApiRateLimitGuard explicitly exempts /api/v1/metrics so frequent scrapes
// (default: every 15 s) do not consume rate-limit budget.

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    if (!this.config.get('ENABLE_METRICS', { infer: true })) {
      throw new NotFoundException('Metrics endpoint is disabled. Set ENABLE_METRICS=true to enable.');
    }

    await this.refreshQueueDepth();

    const text = await this.metrics.registry.metrics();
    res
      .setHeader('Content-Type', this.metrics.registry.contentType)
      .status(200)
      .end(text);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async refreshQueueDepth(): Promise<void> {
    try {
      const rows = await this.db.job.groupBy({
        by: ['name', 'status'],
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        _count: { id: true },
      });

      for (const row of rows) {
        this.metrics.setQueueDepth(
          row.name,
          row.status as 'PENDING' | 'RUNNING',
          row._count.id,
        );
      }
    } catch {
      // Non-critical: stale gauge values are better than a 500 on the scrape.
    }
  }
}
