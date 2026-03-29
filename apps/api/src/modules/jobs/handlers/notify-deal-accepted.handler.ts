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

// Retries a single email send up to `maxAttempts` times with exponential backoff.
// Throws the last error if all attempts fail — caller (pg-boss job) handles re-queuing.
async function withEmailRetry<T>(
  fn: () => Promise<T>,
  logger: import('@nestjs/common').LoggerService,
  label: string,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delayMs = 200 * Math.pow(2, attempt - 1); // 200 ms, 400 ms
        logger.warn?.(
          `[email_retry] ${label} attempt ${attempt}/${maxAttempts} failed — retrying in ${delayMs} ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  logger.error?.(`[email_delivery_failed] ${label} failed after ${maxAttempts} attempts`);
  throw lastErr;
}

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
        traceId: d.traceId,
        offerId: d.offerId,
        acceptanceRecordId: d.acceptanceRecordId,
        jobId: job.id,
      }),
    );

    try {
      await withEmailRetry(
        () => this.emailPort.sendAcceptanceConfirmationToSender({
          to: d.senderEmail,
          senderName: d.senderName,
          offerTitle: d.offerTitle,
          recipientName: d.recipientName,
          recipientEmail: d.recipientEmail,
          acceptedAt,
          certificateId: d.certificateId,
          certificateHash: d.certificateHash,
          verifyUrl: d.verifyUrl,
        }),
        this.logger,
        `sender_email:${d.offerId}`,
      );

      await withEmailRetry(
        () => this.emailPort.sendAcceptanceConfirmationToRecipient({
          to: d.recipientEmail,
          recipientName: d.recipientName,
          offerTitle: d.offerTitle,
          senderName: d.senderName,
          acceptedAt,
          certificateId: d.certificateId,
          certificateHash: d.certificateHash,
          verifyUrl: d.verifyUrl,
        }),
        this.logger,
        `recipient_email:${d.offerId}`,
      );

      this.logger.log(
        JSON.stringify({
          metric: 'notify_deal_accepted_success',
          traceId: d.traceId,
          offerId: d.offerId,
          acceptanceRecordId: d.acceptanceRecordId,
          jobId: job.id,
        }),
      );
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          metric: 'notify_deal_accepted_failed',
          traceId: d.traceId,
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
