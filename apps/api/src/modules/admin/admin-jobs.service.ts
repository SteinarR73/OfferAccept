import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { JobService } from '../jobs/job.service';
import { JobTrackingService } from '../jobs/job-tracking.service';
import { JobName, JobPayloadMap } from '../jobs/job.types';

// ─── AdminJobsService ──────────────────────────────────────────────────────────
// Admin-facing dead-letter queue management.
//
// listDeadLettered: paginated read of jobs table WHERE deadLetteredAt IS NOT NULL.
// requeue:          re-enqueues the job's stored payload via JobService.send(),
//                   updates the tracking row with the new pg-boss ID and resets
//                   all failure state so the job runs again from scratch.
//
// JobService is available for injection because JobsModule is @Global().
// JobTrackingService is exported by JobsModule and therefore injectable here
// after AdminModule is bootstrapped.

@Injectable()
export class AdminJobsService {
  constructor(
    private readonly jobTracking: JobTrackingService,
    private readonly jobService: JobService,
  ) {}

  async listDeadLettered(limit?: number) {
    return this.jobTracking.listDeadLettered(limit);
  }

  // Requeues a dead-lettered job by:
  //   1. Loading the tracking row (validates it exists and is dead-lettered)
  //   2. Sending a new pg-boss job with the stored name + payload
  //   3. Updating the tracking row: new pgBossId, status=PENDING, reset counters
  //
  // Returns the updated tracking row details including the new pg-boss job ID.
  async requeue(id: string): Promise<{ id: string; newPgBossId: string | null }> {
    const job = await this.jobTracking.getDeadLetteredJob(id);

    if (!job) {
      throw new NotFoundException(`Job ${id} not found.`);
    }
    if (!job.deadLetteredAt) {
      throw new BadRequestException(
        `Job ${id} is not dead-lettered and cannot be requeued.`,
      );
    }

    // Re-enqueue via JobService. The cast is safe at runtime — the payload was
    // validated and stored when the job was first claimed. The type system cannot
    // narrow the return type here without a runtime discriminator map.
    const newPgBossId = await this.jobService.send(
      job.name as JobName,
      job.payload as JobPayloadMap[JobName],
    );

    await this.jobTracking.markRequeued(id, newPgBossId);

    return { id, newPgBossId };
  }
}
