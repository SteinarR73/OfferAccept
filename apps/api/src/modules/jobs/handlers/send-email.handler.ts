import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'pg-boss';
import type { SendEmailPayload } from '../job.types';

// ─── SendEmailHandler ──────────────────────────────────────────────────────────
// [STUB — not yet implemented]
//
// This handler is reserved for queue-based email delivery when the application
// needs guaranteed at-least-once sending (e.g., bulk notification campaigns or
// high-volume transactional email).
//
// Current state:
//   The email module sends synchronously via the Resend adapter. That is
//   sufficient for the current volume (one email per user action). When async
//   sending becomes necessary, this handler will dispatch to the EmailPort.
//
// To activate:
//   1. Implement the dispatch logic below (switch on payload.type, call
//      emailPort.send*(payload.params)).
//   2. Remove the TODO_STUB label from job.worker.ts so the worker is registered.
//   3. Update callers to use jobService.send('send-email', ...) instead of
//      calling the email port directly.

@Injectable()
export class SendEmailHandler {
  private readonly logger = new Logger(SendEmailHandler.name);

  async handle(jobs: Job<SendEmailPayload>[]): Promise<void> {
    for (const job of jobs) {
      this.logger.warn(
        `send-email job received but handler not implemented: type=${job.data.type} id=${job.id}`,
      );
      // Intentionally not throwing — mark as completed so stale jobs don't
      // flood the retry queue during development.
    }
  }
}
