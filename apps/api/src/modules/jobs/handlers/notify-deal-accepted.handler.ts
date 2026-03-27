import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Job } from 'pg-boss';
import type { NotifyDealAcceptedPayload } from '../job.types';
import { EMAIL_PORT, EmailPort } from '../../../common/email/email.port';

// ─── NotifyDealAcceptedHandler ────────────────────────────────────────────────
//
// Sends post-acceptance confirmation emails to both the sender and the
// recipient after an offer is accepted.
//
// Why this is a job (not an in-process call):
//   The acceptance transaction commits business state (offer → ACCEPTED,
//   AcceptanceRecord created). Sending confirmation emails in-process on the
//   same request means a transient Resend API outage silently loses the email —
//   the user gets a success response but the notifications never arrive.
//   A pg-boss job survives the API process restart, retries on failure, and
//   archives to the DLQ on exhaustion so operators can investigate.
//
// Emails sent per job:
//   1. Sender   — "Your deal was accepted" with certificate ID + CTA
//   2. Recipient — "Your acceptance is confirmed" with certificate ID
//
// Idempotency:
//   The job is enqueued with singletonKey = "notify-deal-accepted:{acceptanceRecordId}".
//   pg-boss prevents a second job with the same key from being enqueued while
//   one is already pending, so a double-accept() bug cannot produce duplicate jobs.
//
//   On retry (same job, new attempt): both emails may be resent if the first
//   attempt failed after sending one but before the second. For transactional
//   confirmation emails one extra send is far better than silent non-delivery.
//   The acceptanceRecordId is included in every log line for ops investigation.
//
// Error handling:
//   Errors are logged with structured JSON and re-thrown so pg-boss marks the
//   job as failed and schedules a retry. Do NOT swallow errors here.
//
// Metric markers (log field `metric`):
//   notify_deal_accepted_start   — job picked up
//   notify_deal_accepted_success — both emails delivered successfully
//   notify_deal_accepted_failed  — at least one email failed; job will retry

@Injectable()
export class NotifyDealAcceptedHandler {
  private readonly logger = new Logger(NotifyDealAcceptedHandler.name);

  constructor(@Inject(EMAIL_PORT) private readonly emailPort: EmailPort) {}

  async handle(jobs: Job<NotifyDealAcceptedPayload>[]): Promise<void> {
    for (const job of jobs) {
      await this.handleOne(job);
    }
  }

  private async handleOne(job: Job<NotifyDealAcceptedPayload>): Promise<void> {
    const d = job.data;
    const acceptedAt = new Date(d.acceptedAt);

    this.logger.log(
      JSON.stringify({
        metric: 'notify_deal_accepted_start',
        offerId: d.offerId,
        acceptanceRecordId: d.acceptanceRecordId,
        jobId: job.id,
      }),
    );

    try {
      await this.emailPort.sendAcceptanceConfirmationToSender({
        to: d.senderEmail,
        senderName: d.senderName,
        offerTitle: d.offerTitle,
        recipientName: d.recipientName,
        recipientEmail: d.recipientEmail,
        acceptedAt,
        certificateId: d.certificateId,
      });

      await this.emailPort.sendAcceptanceConfirmationToRecipient({
        to: d.recipientEmail,
        recipientName: d.recipientName,
        offerTitle: d.offerTitle,
        senderName: d.senderName,
        acceptedAt,
        certificateId: d.certificateId,
      });

      this.logger.log(
        JSON.stringify({
          metric: 'notify_deal_accepted_success',
          offerId: d.offerId,
          acceptanceRecordId: d.acceptanceRecordId,
          jobId: job.id,
        }),
      );
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          metric: 'notify_deal_accepted_failed',
          offerId: d.offerId,
          acceptanceRecordId: d.acceptanceRecordId,
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      // Re-throw so pg-boss marks this attempt as failed and schedules a retry.
      // NEVER swallow errors in a job handler — silent failure == lost email.
      throw err;
    }
  }
}
