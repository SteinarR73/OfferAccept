import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

// ─── MetricsModule ─────────────────────────────────────────────────────────────
// @Global so MetricsService can be injected in any module without explicit import.
// MetricsController is registered here — it exposes GET /metrics.
// The PRISMA token used by MetricsController is provided by DatabaseModule (global).

@Global()
@Module({
  controllers: [MetricsController],
  providers:   [MetricsService],
  exports:     [MetricsService],
})
export class MetricsModule {}
