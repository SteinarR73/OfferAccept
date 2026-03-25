import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { CertificateService } from '../../certificates/certificate.service';
import type { IssueCertificatePayload } from '../job.types';

// ─── IssueCertificateHandler ──────────────────────────────────────────────────
// Generates an AcceptanceCertificate for a completed AcceptanceRecord.
//
// Triggered by:
//   AcceptanceService (synchronous flow) → enqueues this job immediately after
//   the AcceptanceRecord is committed, so certificate generation is async and
//   does not block the acceptance response.
//
// Idempotency:
//   CertificateService.generateForAcceptance() has a built-in idempotency
//   guard — it returns the existing certificate if one already exists for the
//   same acceptanceRecordId. Safe to retry without side effects.
//
// Retry policy (set on queue): 5 attempts with exponential backoff.
//   Certificate generation reads immutable tables (no race conditions).

@Injectable()
export class IssueCertificateHandler {
  private readonly logger = new Logger(IssueCertificateHandler.name);

  constructor(private readonly certificateService: CertificateService) {}

  async handle(jobs: Job<IssueCertificatePayload>[]): Promise<void> {
    for (const job of jobs) {
      const { acceptanceRecordId } = job.data;

      try {
        const { certificateId } = await this.certificateService.generateForAcceptance(
          acceptanceRecordId,
        );
        this.logger.log(JSON.stringify({
          event: 'certificate_issued',
          certId: certificateId,
          acceptanceRecordId,
        }));
      } catch (err) {
        this.logger.error(
          JSON.stringify({ event: 'certificate_issuance_failed', acceptanceRecordId }),
          err instanceof Error ? err.stack : String(err),
        );
        // Re-throw so pg-boss marks this job as failed and schedules a retry.
        throw err;
      }
    }
  }
}
