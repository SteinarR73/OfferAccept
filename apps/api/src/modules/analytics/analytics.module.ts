import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AcceptanceInsightsService } from './acceptance-insights.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AcceptanceInsightsService],
})
export class AnalyticsModule {}
