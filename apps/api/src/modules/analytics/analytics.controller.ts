import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

// ─── AnalyticsController ──────────────────────────────────────────────────────
// Read-only analytics for the authenticated user's org.
// All endpoints require JWT auth — no cross-org data is ever returned.

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // GET /analytics/overview
  // Returns aggregate deal lifecycle metrics for the caller's org.
  @Get('overview')
  async getOverview(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getOverview(user.orgId);
  }
}
