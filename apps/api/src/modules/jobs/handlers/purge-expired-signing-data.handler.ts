import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'pg-boss';
import type { PurgeExpiredSigningDataPayload } from '../job.types';

// ─── PurgeExpiredSigningDataHandler ───────────────────────────────────────────
// Deletes mutable signing session data older than ACCEPTANCE_RETENTION_YEARS.
//
// ── What is deleted ───────────────────────────────────────────────────────────
//   SigningSession       — mutable session state; evidence lives in AcceptanceRecord
//   SigningOtpChallenge  — hashed OTP codes; no evidential value after retention period
//
// ── What is NEVER deleted ─────────────────────────────────────────────────────
//   AcceptanceRecord      — immutable evidence; preserved under GDPR Art. 17(3)(e)
//   OfferSnapshot         — immutable document version; required for hash verification
//   OfferSnapshotDocument — immutable document ref
//   SigningEvent          — immutable audit chain; required for certificate integrity
//
// ── GDPR Art. 17(3)(e) ────────────────────────────────────────────────────────
//   Erasure requests for immutable evidence records are assessed individually.
//   Processing is necessary for establishment, exercise, or defence of legal claims.
//   See: account.service.ts — ErasureRequest handling.
//
// ── Idempotency ───────────────────────────────────────────────────────────────
//   deleteMany is idempotent: re-running after a partial failure is safe.
//
// ── Cron schedule ─────────────────────────────────────────────────────────────
//   0 3 * * * (03:00 UTC daily — offset from archive-deal-events at 02:00)

const DEFAULT_RETENTION_YEARS  = 10;
const DEFAULT_OTP_PURGE_YEARS  = 1;
const DEFAULT_BATCH_SIZE       = 5_000;

@Injectable()
export class PurgeExpiredSigningDataHandler {
  private readonly logger = new Logger(PurgeExpiredSigningDataHandler.name);

  private readonly retentionYears: number;
  private readonly otpPurgeYears: number;
  private readonly batchSize: number;

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly config: ConfigService,
  ) {
    this.retentionYears = this.config.get<number>('ACCEPTANCE_RETENTION_YEARS', DEFAULT_RETENTION_YEARS);
    this.otpPurgeYears  = DEFAULT_OTP_PURGE_YEARS;
    this.batchSize      = DEFAULT_BATCH_SIZE;
  }

  async handle(jobs: Job<PurgeExpiredSigningDataPayload>[]): Promise<void> {
    void jobs; // cron sweep — payload carries no parameters

    const sessionCutoff = new Date();
    sessionCutoff.setFullYear(sessionCutoff.getFullYear() - this.retentionYears);

    const otpCutoff = new Date();
    otpCutoff.setFullYear(otpCutoff.getFullYear() - this.otpPurgeYears);

    this.logger.log(
      {
        event: 'purge_signing_data_start',
        sessionCutoff: sessionCutoff.toISOString(),
        otpCutoff: otpCutoff.toISOString(),
        retentionYears: this.retentionYears,
      },
      `[PurgeExpiredSigningData] Starting sweep (session cutoff: ${sessionCutoff.toISOString()})`,
    );

    // ── 1. Purge expired SigningOtpChallenge rows (short retention — no evidence value)
    const otpResult = await this.db.signingOtpChallenge.deleteMany({
      where: { createdAt: { lt: otpCutoff } },
    });

    this.logger.log(
      { event: 'purge_otp_challenges_complete', deleted: otpResult.count },
      `[PurgeExpiredSigningData] Deleted ${otpResult.count} expired OTP challenge rows.`,
    );

    // ── 2. Purge expired SigningSession rows in batches
    //    Sessions are mutable — the durable evidence is in AcceptanceRecord.
    //    We delete in batches to bound transaction time and avoid long locks.
    let totalDeletedSessions = 0;
    let batchDeleted = 0;

    do {
      // Collect IDs for the current batch
      const batchIds = await this.db.signingSession.findMany({
        where: { startedAt: { lt: sessionCutoff } },
        select: { id: true },
        take: this.batchSize,
        orderBy: { startedAt: 'asc' },
      });

      if (batchIds.length === 0) break;

      const result = await this.db.signingSession.deleteMany({
        where: { id: { in: batchIds.map((r) => r.id) } },
      });

      batchDeleted = result.count;
      totalDeletedSessions += batchDeleted;
    } while (batchDeleted === this.batchSize);

    this.logger.log(
      {
        event: 'purge_signing_sessions_complete',
        deleted: totalDeletedSessions,
        retentionYears: this.retentionYears,
      },
      `[PurgeExpiredSigningData] Deleted ${totalDeletedSessions} expired SigningSession rows.`,
    );
  }
}
