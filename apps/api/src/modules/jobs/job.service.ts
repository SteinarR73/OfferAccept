import { Inject, Injectable, Logger } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import type { SendOptions } from 'pg-boss';
import { JobName, JobPayloadMap } from './job.types';

export const JOB_BOSS = 'JOB_BOSS';

// ─── JobService ────────────────────────────────────────────────────────────────
// Typed enqueue API used by all producers (services that want to schedule work).
//
// Usage:
//   await jobService.send('issue-certificate', { acceptanceRecordId: '...' });
//
// All calls go through this service rather than calling PgBoss directly so that:
//   - Payload types are enforced at compile time
//   - Logging and error handling are centralised
//   - Tests can swap this service without instantiating a real pg-boss instance
//
// Singleton deduplication:
//   Pass singletonKey to prevent duplicate jobs with the same logical key from
//   accumulating while one is already pending or running:
//     await jobService.send('expire-sessions', {}, { singletonKey: 'expire-sessions' });
//
// Idempotency guarantee:
//   Handlers must be idempotent — pg-boss will re-run a job on retry after a
//   transient failure, so duplicate execution must produce the same result.

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(@Inject(JOB_BOSS) private readonly boss: PgBoss) {}

  /**
   * Enqueue a job. Returns the job ID, or null if deduplicated by singletonKey.
   */
  async send<N extends JobName>(
    name: N,
    data: JobPayloadMap[N],
    options?: SendOptions,
  ): Promise<string | null> {
    const jobId = await this.boss.send(name, data as object, options ?? {});
    if (jobId) {
      this.logger.debug(`Job enqueued: ${name} → id=${jobId}`);
    } else {
      this.logger.debug(`Job deduplicated (singleton already pending): ${name}`);
    }
    return jobId;
  }

  /**
   * Enqueue a job only if no job with the same name is already pending/running.
   * Equivalent to send() with singletonKey=name.
   */
  async sendOnce<N extends JobName>(
    name: N,
    data: JobPayloadMap[N],
    options?: Omit<SendOptions, 'singletonKey'>,
  ): Promise<string | null> {
    return this.send(name, data, { ...options, singletonKey: name });
  }
}
