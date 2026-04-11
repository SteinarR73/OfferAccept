import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { hostname } from 'os';
import { PrismaClient } from '@prisma/client';
import { JobName, QUEUE_OPTIONS } from './job.types';

// ─── Constants ─────────────────────────────────────────────────────────────────
// Jobs locked longer than this threshold are considered stale (worker crashed).
// Must be larger than the longest expected single-job execution time.
const STALE_LOCK_MS = 5 * 60 * 1000; // 5 minutes

// Stable worker identity for the current process — stored in lockedBy.
// "hostname:pid" is unique per process and visible in logs / DB tooling.
export const WORKER_ID = `${hostname()}:${process.pid}`;

// Maximum total delivery attempts per job name, derived from pg-boss retry limits.
// QUEUE_OPTIONS.retryLimit = number of retries after the first attempt.
// maxAttempts = retryLimit + 1 (first attempt + retries).
const JOB_MAX_ATTEMPTS: Record<JobName, number> = Object.fromEntries(
  (Object.entries(QUEUE_OPTIONS) as [JobName, (typeof QUEUE_OPTIONS)[JobName]][]).map(
    ([name, opts]) => [name, (opts.retryLimit ?? 0) + 1],
  ),
) as Record<JobName, number>;

// ─── JobTrackingService ────────────────────────────────────────────────────────
// Maintains the `jobs` table as an observability and admin-management layer
// on top of pg-boss.
//
// Call sequence per job execution (orchestrated by JobWorker.trackAndHandle):
//   1. claimJob()  — upsert tracking row to RUNNING; increment attempts
//   2. handler runs
//   3a. completeJob() — status = COMPLETED, lock cleared
//   3b. failJob()     — status = FAILED or DEAD_LETTERED, lock cleared
//
// On application bootstrap: recoverStaleLocks() resets RUNNING rows whose
// lockedAt is older than STALE_LOCK_MS — these represent jobs whose worker
// process crashed before completing or failing.

@Injectable()
export class JobTrackingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobTrackingService.name);

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  // ── Stale lock recovery ──────────────────────────────────────────────────────
  // Run on every startup before workers register with pg-boss.
  // Jobs left RUNNING from a previous crashed process are reset to FAILED so the
  // counter is updated and pg-boss re-delivery finds the row in the right state.
  async onApplicationBootstrap(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_LOCK_MS);

    const { count } = await this.db.job.updateMany({
      where: {
        status: 'RUNNING',
        lockedAt: { lt: cutoff },
      },
      data: {
        status:    'FAILED',
        lockedAt:  null,
        lockedBy:  null,
        failReason: 'Stale lock recovered on startup — worker process likely crashed mid-execution.',
      },
    });

    if (count > 0) {
      this.logger.warn(
        { event: 'stale_lock_recovery', count },
        `[JobTracking] Recovered ${count} stale lock(s) on startup.`,
      );
    } else {
      this.logger.debug('[JobTracking] No stale locks found on startup.');
    }
  }

  // ── Atomic claim ─────────────────────────────────────────────────────────────
  // Upserts the tracking row for a pg-boss job delivery to RUNNING state.
  // On first delivery: creates the row with attempts=1.
  // On retry delivery: increments attempts and refreshes the lock.
  //
  // pg-boss provides mutual exclusion at the queue level — only one worker
  // process receives a given job at a time. The upsert here records that
  // the current process has ownership of this execution attempt.
  async claimJob(
    pgBossId: string,
    name: JobName,
    payload: unknown,
  ): Promise<void> {
    const now = new Date();
    const maxAttempts = JOB_MAX_ATTEMPTS[name] ?? 3;

    await this.db.job.upsert({
      where:  { pgBossId },
      create: {
        pgBossId,
        name,
        payload:     payload as object,
        status:      'RUNNING',
        attempts:    1,
        maxAttempts,
        lockedAt:    now,
        lockedBy:    WORKER_ID,
      },
      update: {
        status:      'RUNNING',
        attempts:    { increment: 1 },
        lockedAt:    now,
        lockedBy:    WORKER_ID,
        failReason:  null,        // clear previous failure reason on retry
      },
    });
  }

  // ── Complete ─────────────────────────────────────────────────────────────────
  async completeJob(pgBossId: string): Promise<void> {
    await this.db.job.update({
      where: { pgBossId },
      data: {
        status:    'COMPLETED',
        lockedAt:  null,
        lockedBy:  null,
        failReason: null,
      },
    });
  }

  // ── Fail ─────────────────────────────────────────────────────────────────────
  // Records a failure. If this was the last allowed attempt, dead-letters the job.
  // Always re-throws the original error so pg-boss handles retry scheduling.
  async failJob(pgBossId: string, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);

    // Read current attempts to decide whether to dead-letter.
    const row = await this.db.job.findUnique({
      where:  { pgBossId },
      select: { attempts: true, maxAttempts: true },
    });

    const isExhausted = row !== null && row.attempts >= row.maxAttempts;

    if (isExhausted) {
      await this.db.job.update({
        where: { pgBossId },
        data: {
          status:        'DEAD_LETTERED',
          deadLetteredAt: new Date(),
          failReason:    reason,
          lockedAt:      null,
          lockedBy:      null,
        },
      });
      this.logger.warn(
        { event: 'job_dead_lettered', pgBossId, attempts: row!.attempts, reason },
        `[JobTracking] Job dead-lettered after ${row!.attempts} attempt(s).`,
      );
    } else {
      await this.db.job.update({
        where: { pgBossId },
        data: {
          status:    'FAILED',
          failReason: reason,
          lockedAt:  null,
          lockedBy:  null,
        },
      });
    }
  }

  // ── Dead-letter query ────────────────────────────────────────────────────────
  async listDeadLettered(limit = 50): Promise<{
    id: string;
    name: string;
    attempts: number;
    maxAttempts: number;
    failReason: string | null;
    deadLetteredAt: Date;
    payload: unknown;
    createdAt: Date;
  }[]> {
    const take = Math.min(Math.max(1, limit), 200);
    return this.db.job.findMany({
      where: { deadLetteredAt: { not: null } },
      orderBy: { deadLetteredAt: 'desc' },
      take,
      select: {
        id: true, name: true, attempts: true, maxAttempts: true,
        failReason: true, deadLetteredAt: true, payload: true, createdAt: true,
      },
    }) as Promise<{
      id: string; name: string; attempts: number; maxAttempts: number;
      failReason: string | null; deadLetteredAt: Date; payload: unknown; createdAt: Date;
    }[]>;
  }

  // ── Requeue ──────────────────────────────────────────────────────────────────
  // Returns the tracking row so the caller can re-enqueue via JobService and then
  // update pgBossId. Split so JobTrackingService doesn't import JobService
  // (avoids circular dependency risk).
  async getDeadLetteredJob(id: string): Promise<{
    id: string;
    name: string;
    payload: unknown;
    deadLetteredAt: Date | null;
  } | null> {
    return this.db.job.findUnique({
      where:  { id },
      select: { id: true, name: true, payload: true, deadLetteredAt: true },
    });
  }

  // Called after a new pg-boss job is successfully enqueued to update the
  // tracking row with the new pg-boss ID and reset all failure state.
  async markRequeued(id: string, newPgBossId: string | null): Promise<void> {
    await this.db.job.update({
      where: { id },
      data: {
        pgBossId:       newPgBossId,
        status:         'PENDING',
        attempts:       0,
        failReason:     null,
        deadLetteredAt: null,
        lockedAt:       null,
        lockedBy:       null,
      },
    });
  }
}
