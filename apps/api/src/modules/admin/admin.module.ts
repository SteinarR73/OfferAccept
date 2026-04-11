import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminSettingsService } from './admin-settings.service';
import { AdminGuard } from '../../common/auth/admin.guard';
import { AdminJobsService } from './admin-jobs.service';

// JobsModule is @Global() — JobService and JobTrackingService are available
// for injection without importing JobsModule here.

@Module({
  controllers: [AdminController],
  providers: [AdminSettingsService, AdminGuard, AdminJobsService],
  exports: [AdminSettingsService],
})
export class AdminModule {}
