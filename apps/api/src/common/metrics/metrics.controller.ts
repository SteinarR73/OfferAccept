import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MetricsService } from './metrics.service';

// ─── MetricsController ────────────────────────────────────────────────────────
// GET /metrics — returns Prometheus text-format metrics.
//
// No authentication: Prometheus scrapers use network-level access control.
// In production, firewall this endpoint so only the metrics collector can reach it.
// The ApiRateLimitGuard explicitly exempts /api/v1/metrics so frequent scrapes
// (default: every 15 s) do not consume rate-limit budget.
//
// Before serialising the registry, the controller refreshes the queue_depth gauge
// from the database so every scrape reflects the current job backlog.

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject('PRISMA') private readonly db: PrismaClient,
  ) {}

  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    await this.refreshQueueDepth();

    const text = await this.metrics.registry.metrics();
    res
      .setHeader('Content-Type', this.metrics.registry.contentType)
      .status(200)
      .end(text);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  // Query PENDING and RUNNING job counts per job name from the application jobs
  // table and update the queue_depth gauge. Called on every scrape so the gauge
  // always reflects current state without a background polling loop.
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
      // Non-critical: if the DB is unavailable we skip the refresh.
      // Stale gauge values are better than a 500 on the metrics endpoint.
    }
  }
}
