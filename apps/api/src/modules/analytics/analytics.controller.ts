import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { AcceptanceInsightsService } from './acceptance-insights.service';
import { DealEventService } from '../deal-events/deal-events.service';

// ─── AnalyticsController ──────────────────────────────────────────────────────
// Read-only analytics for the authenticated user's org.
// All endpoints require JWT auth — no cross-org data is ever returned.

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly insightsService: AcceptanceInsightsService,
    private readonly dealEventService: DealEventService,
  ) {}

  // GET /analytics/overview
  // Returns aggregate deal lifecycle metrics for the caller's org.
  @Get('overview')
  async getOverview(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getOverview(user.orgId);
  }

  // GET /analytics/insights
  // Returns actionable acceptance intelligence for the caller's org.
  @Get('insights')
  async getInsights(@CurrentUser() user: JwtPayload) {
    return this.insightsService.getInsights(user.orgId);
  }

  // GET /analytics/events?limit=20
  // Returns the most recent deal lifecycle events for the caller's org.
  // Used by the dashboard activity feed.
  @Get('events')
  async getEvents(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 20, 100) : 20;
    const events = await this.dealEventService.getRecentForOrg(user.orgId, limit);
    return { events };
  }
}
