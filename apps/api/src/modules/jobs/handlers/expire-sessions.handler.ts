import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'pg-boss';
import type { ExpireSessionsPayload } from '../job.types';

// ─── ExpireSessionsHandler ─────────────────────────────────────────────────────
// Batch sweep: marks all signing sessions whose TTL has passed as EXPIRED.
//
// Idempotency:
//   updateMany with status IN (AWAITING_OTP, OTP_VERIFIED) AND expiresAt < NOW()
//   Running multiple times produces the same outcome — already-expired sessions
//   have a terminal status and are silently skipped.
//
// This handler is triggered on a schedule (every 5 minutes). It runs as a
// single batch sweep rather than per-session to keep DB round-trips minimal.
//
// Note: signing events for SESSION_EXPIRED are deliberately NOT created here.
// The event service requires a non-expired, non-terminal session to append
// events. Batch expiry skips event creation for simplicity; individual
// expiry detected during a live signing flow DOES create the event.

@Injectable()
export class ExpireSessionsHandler {
  private readonly logger = new Logger(ExpireSessionsHandler.name);

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  async handle(jobs: Job<ExpireSessionsPayload>[]): Promise<void> {
    const now = new Date();

    const result = await this.db.signingSession.updateMany({
      where: {
        status: { in: ['AWAITING_OTP', 'OTP_VERIFIED'] },
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log(JSON.stringify({ event: 'sessions_expired', count: result.count }));
    }

    // Also expire OTP challenges associated with now-expired sessions.
    await this.db.signingOtpChallenge.updateMany({
      where: {
        status: 'PENDING',
        session: { status: 'EXPIRED' },
      },
      data: { status: 'EXPIRED' },
    });

    // Consume the batch (pg-boss marks jobs as completed when handler returns).
    void jobs;
  }
}
