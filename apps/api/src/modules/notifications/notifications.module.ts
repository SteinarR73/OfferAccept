import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

// ─── NotificationsModule ──────────────────────────────────────────────────────
// Provides NotificationsService to any module that imports it.
//
// Depends on EMAIL_PORT, which is exported by the global EmailModule.
// Import this module wherever NotificationsService is needed:
//   - SigningModule   (accepted + declined notifications)
//   - JobsModule      (expired notifications from batch sweep)

@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
