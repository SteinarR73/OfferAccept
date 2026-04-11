import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtPayload } from '../../common/auth/jwt-auth.guard';
import { AdminSettingsService, UpdateSettingsSchema } from './admin-settings.service';
import { AdminJobsService } from './admin-jobs.service';

// ─── AdminController ───────────────────────────────────────────────────────────
// Platform administration endpoints.
// ALL routes require role=OWNER or role=INTERNAL_SUPPORT — enforced by AdminGuard.
//
// GET  /admin/settings             — return all settings (defaults applied for unset keys)
// PATCH /admin/settings            — partial update; unknown keys are rejected (Zod strict)
// GET  /admin/settings/audit       — audit log, newest first, optional ?limit=N (max 500)
// GET  /admin/dead-letters         — list dead-lettered jobs, optional ?limit=N (max 200)
// POST /admin/dead-letters/:id/requeue — requeue a dead-lettered job
//
// Settings survive server restarts: they are persisted in the system_settings
// table and read from the DB on every request.

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly settingsService: AdminSettingsService,
    private readonly adminJobsService: AdminJobsService,
  ) {}

  // GET /admin/settings
  // Returns the full settings object. Keys that have never been PATCHed return
  // the SETTING_DEFAULTS value defined in AdminSettingsService.
  @Get('settings')
  getSettings() {
    return this.settingsService.getAll();
  }

  // PATCH /admin/settings
  // Accepts a partial object — only provide the keys you want to change.
  // Returns the full settings object (all keys) after the update.
  //
  // Example body:  { "offer_expiry_days": 14, "support_email": "ops@acme.com" }
  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = UpdateSettingsSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed.',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return this.settingsService.updateMany(user.sub, result.data);
  }

  // GET /admin/settings/audit?limit=N
  // Returns audit log rows newest-first. limit defaults to 100, maximum 500.
  // Route must be declared BEFORE any parameterised routes on this controller
  // to avoid NestJS treating "audit" as a route param value.
  @Get('settings/audit')
  getSettingsAudit(@Query('limit') limitStr?: string) {
    const limit = limitStr !== undefined ? parseInt(limitStr, 10) : undefined;
    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      throw new BadRequestException('limit must be a positive integer.');
    }
    return this.settingsService.getAuditLog(limit);
  }

  // GET /admin/dead-letters?limit=N
  // Returns dead-lettered jobs newest-first. limit defaults to 50, maximum 200.
  // Dead-lettered = jobs that exhausted all retry attempts without succeeding.
  // Counterpart SQL (pg-boss archive):
  //   SELECT * FROM pgboss.archive WHERE name = '<job>' ORDER BY archivedon DESC;
  @Get('dead-letters')
  getDeadLetters(@Query('limit') limitStr?: string) {
    const limit = limitStr !== undefined ? parseInt(limitStr, 10) : undefined;
    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      throw new BadRequestException('limit must be a positive integer.');
    }
    return this.adminJobsService.listDeadLettered(limit);
  }

  // POST /admin/dead-letters/:id/requeue
  // Re-enqueues a dead-lettered job using the stored name + payload.
  // A new pg-boss job ID is assigned; the tracking row is reset to PENDING.
  // 200: { id, newPgBossId }
  // 404: job not found
  // 400: job exists but is not dead-lettered
  @Post('dead-letters/:id/requeue')
  @HttpCode(HttpStatus.OK)
  requeueDeadLetter(@Param('id') id: string) {
    return this.adminJobsService.requeue(id);
  }
}
