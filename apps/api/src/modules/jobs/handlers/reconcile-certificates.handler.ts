import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { CertificateService } from '../../certificates/certificate.service';
import { JobService } from '../job.service';
import type { ReconcileCertificatesPayload } from '../job.types';

// ─── ReconcileCertificatesHandler ─────────────────────────────────────────────
// Cron sweep (every 15 minutes) that detects AcceptanceRecords with no
// AcceptanceCertificate and re-enqueues issue-certificate jobs for each.
//
// Why this exists:
//   Certificate generation is triggered synchronously in the acceptance flow.
//   If that call throws (DB connection blip, transient error), the deal is
//   committed but the certificate is never issued — and there is no automatic
//   retry because no job was enqueued. This sweep is the safety net that
//   catches those silent failures.
//
//   It also recovers from exhausted retries: once a job is archived to the DLQ,
//   pg-boss will not retry it automatically. This handler re-enqueues fresh jobs
//   for any still-missing certificate, resetting the retry counter.
//
// Grace period:
//   The handler only acts on records that have been accepted for longer than
//   MISSING_THRESHOLD_MS (30 minutes). This avoids racing with in-flight
//   synchronous certificate generation.
//
// Idempotency:
//   CertificateService.generateForAcceptance() and the issue-certificate handler
//   both have idempotency guards. Re-enqueuing for an already-issued certificate
//   is a no-op.
//
// Observability events (all structured JSON):
//   certificate_reconciliation_clean   — no missing certificates found
//   certificate_reconciliation_backlog — N records without certificates detected
//   certificate_reconciliation_requeued — individual re-enqueue confirmation

@Injectable()
export class ReconcileCertificatesHandler {
  private readonly logger = new Logger(ReconcileCertificatesHandler.name);

  // Certificates older than this without being issued are considered stuck.
  // 30 minutes gives the synchronous path and any in-flight job time to succeed.
  static readonly MISSING_THRESHOLD_MS = 30 * 60 * 1000;

  constructor(
    private readonly certificateService: CertificateService,
    private readonly jobService: JobService,
  ) {}

  async handle(jobs: Job<ReconcileCertificatesPayload>[]): Promise<void> {
    void jobs; // cron-triggered sweep — no per-job payload used

    const missing = await this.certificateService.findMissingCertificates(
      ReconcileCertificatesHandler.MISSING_THRESHOLD_MS,
    );

    if (missing.length === 0) {
      this.logger.log(JSON.stringify({
        event: 'certificate_reconciliation_clean',
        thresholdMinutes: ReconcileCertificatesHandler.MISSING_THRESHOLD_MS / 60_000,
      }));
      return;
    }

    // Backlog detected — log as WARN so this is visible in dashboards and
    // can trigger alerts if the count grows or persists across sweeps.
    this.logger.warn(JSON.stringify({
      event: 'certificate_reconciliation_backlog',
      count: missing.length,
      oldestAcceptedAt: missing[0]?.acceptedAt.toISOString(),
      acceptanceRecordIds: missing.map((r) => r.id),
    }));

    for (const record of missing) {
      await this.jobService.send('issue-certificate', {
        acceptanceRecordId: record.id,
      });
      this.logger.log(JSON.stringify({
        event: 'certificate_reconciliation_requeued',
        acceptanceRecordId: record.id,
        acceptedAt: record.acceptedAt.toISOString(),
      }));
    }
  }
}
