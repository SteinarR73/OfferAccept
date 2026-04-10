import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Job } from 'pg-boss';
import { CertificateService } from '../../certificates/certificate.service';
import { JobService } from '../job.service';
import type { IssueCertificatePayload } from '../job.types';

// ─── IssueCertificateHandler ──────────────────────────────────────────────────
// Generates an AcceptanceCertificate for a completed AcceptanceRecord.
//
// Triggered by:
//   ReconcileCertificatesHandler (cron sweep) re-enqueues this job for any
//   AcceptanceRecord that has no certificate after the grace period.
//   May also be enqueued directly by application code after acceptance.
//
// Idempotency:
//   CertificateService.generateForAcceptance() has a built-in idempotency
//   guard — it returns the existing certificate if one already exists for the
//   same acceptanceRecordId. Safe to retry without side effects.
//
// Retry policy (set on queue): 5 attempts with exponential backoff.
//   Certificate generation reads immutable tables (no race conditions).
//
// Dead-letter detection:
//   On the final attempt (attempt === retryLimit), a certificate_dlq_risk event
//   is logged at ERROR level before the attempt. If the attempt fails, the job
//   is archived to pgboss.archive (DLQ) and the reconciliation sweep will
//   eventually re-enqueue a fresh job.
//
// Observability events (all structured JSON):
//   certificate_job_started   — logged at the start of every attempt
//   certificate_issued        — logged on success
//   certificate_issuance_failed — logged on failure (before rethrow)
//   certificate_dlq_risk      — logged on the final attempt

@Injectable()
export class IssueCertificateHandler {
  private readonly logger = new Logger(IssueCertificateHandler.name);

  constructor(
    private readonly certificateService: CertificateService,
    private readonly jobService: JobService,
  ) {}

  async handle(jobs: Job<IssueCertificatePayload>[]): Promise<void> {
    for (const job of jobs) {
      const { acceptanceRecordId } = job.data;
      // pg-boss passes raw DB row fields in lowercase (retrycount, retrylimit).
      // They are not part of the typed Job<T> interface but are present at runtime.
      const raw = job as unknown as { retrycount?: number; retrylimit?: number };
      const attempt    = (raw.retrycount ?? 0) + 1;
      const retryLimit =  raw.retrylimit ?? 5;

      // Cron-triggered job — no HTTP request context. Generate a fresh traceId
      // so all log lines for this attempt can be correlated in log aggregation.
      const traceId = randomUUID();

      this.logger.log(JSON.stringify({
        event: 'certificate_job_started',
        traceId,
        jobId: job.id,
        acceptanceRecordId,
        attempt,
        retryLimit,
      }));

      // Warn before the final attempt — if this fails the job goes to the DLQ
      // and the reconciliation sweep must re-enqueue it.
      if (attempt >= retryLimit) {
        this.logger.error(JSON.stringify({
          event: 'certificate_dlq_risk',
          traceId,
          jobId: job.id,
          acceptanceRecordId,
          attempt,
          retryLimit,
          alert: 'Final retry. Failure will archive this job to the DLQ. ' +
                 'The reconcile-certificates sweep will re-enqueue within 15 min.',
        }));
      }

      try {
        const { certificateId } = await this.certificateService.generateForAcceptance(
          acceptanceRecordId,
        );
        this.logger.log(JSON.stringify({
          event: 'certificate_issued',
          traceId,
          jobId: job.id,
          certId: certificateId,
          acceptanceRecordId,
          attempt,
        }));

        // Enqueue async PDF generation — singletonKey prevents duplicate jobs.
        await this.jobService.send(
          'generate-certificate-pdf',
          { certificateId },
          { singletonKey: `generate-certificate-pdf:${certificateId}` },
        );
      } catch (err) {
        this.logger.error(
          JSON.stringify({ event: 'certificate_issuance_failed', traceId, jobId: job.id, acceptanceRecordId, attempt }),
          err instanceof Error ? err.stack : String(err),
        );
        // Re-throw so pg-boss marks this job as failed and schedules a retry.
        throw err;
      }
    }
  }
}
