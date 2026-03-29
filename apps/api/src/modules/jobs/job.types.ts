import type { QueueOptions } from 'pg-boss';

// ─── Job registry ──────────────────────────────────────────────────────────────
// Single source of truth for every job name and its payload shape.
// Consumers call JobService.send<'job-name'>('job-name', payload) and get
// compile-time type checking on the payload.
//
// Queue-level defaults (retry policy, TTL) are defined in QUEUE_OPTIONS below.
// These are applied at startup via boss.createQueue() so that every job sent to
// a queue inherits the policy — no need to repeat them in each send() call.
//
// Dead-letter queue:
//   pg-boss archives exhausted jobs to the `pgboss.archive` table. Monitor it
//   with:  SELECT * FROM pgboss.archive WHERE name = 'job-name' ORDER BY archivedon DESC;

// ── Payload types ────────────────────────────────────────────────────────────

export interface ExpireSessionsPayload {
  // Cron-triggered sweep — no per-job parameters needed.
}

export interface ExpireOffersPayload {
  // Cron-triggered sweep — no per-job parameters needed.
}

export interface IssueCertificatePayload {
  acceptanceRecordId: string;
}

export interface SendEmailPayload {
  // Deferred until the email module grows a queue-based sending path.
  // Current flow: synchronous fire-and-forget via Resend adapter.
  type: string;
  params: Record<string, unknown>;
}

export interface SendWebhookPayload {
  endpointId: string;
  event: string;
  payload: Record<string, unknown>;
  // 1-based attempt counter — carried in the body for customer debugging.
  attempt: number;
  // Stable UUID identifying this logical event across all retries.
  // Used for:
  //   1. Replay protection in SendWebhookHandler (skip if already delivered).
  //   2. Idempotency for customers — the "id" field in the webhook body.
  webhookEventId: string;
  // X-Request-ID of the originating HTTP request — carried for log correlation.
  // Undefined for events dispatched outside a request context (e.g., cron jobs).
  traceId?: string;
}

export interface ResetMonthlyBillingPayload {
  // Cron-triggered sweep — resets per-org monthly offer counts.
}

export interface SendRemindersPayload {
  // Cron-triggered sweep — no per-job parameters needed.
}

export interface ReconcileCertificatesPayload {
  // Cron-triggered sweep — no per-job parameters needed.
}

// ── notify-deal-accepted ───────────────────────────────────────────────────────
//
// Enqueued by SigningFlowService immediately after the acceptance transaction
// commits and the certificate ID is known. The handler sends two emails:
//   1. Sender   — "Your deal was accepted" + certificate ID
//   2. Recipient — "Your acceptance is confirmed" + certificate ID
//
// All fields are serialisable primitives so the payload survives pg-boss JSON
// storage cleanly. Dates are carried as ISO-8601 strings.
//
// Idempotency:
//   Enqueued with singletonKey = "notify-deal-accepted:{acceptanceRecordId}".
//   pg-boss will refuse a second enqueue while a job with the same key is
//   pending, preventing duplicate jobs if accept() is somehow called twice.
//
//   Handler-level: if the job is retried after a transient Resend failure it
//   may resend emails already delivered. For transactional confirmation emails
//   one extra send is acceptable and far better than silent non-delivery.
//   The acceptanceRecordId is logged on every attempt for ops investigation.

export interface NotifyDealAcceptedPayload {
  // Stable identifier used for idempotency key and operational tracing.
  acceptanceRecordId: string;
  offerId: string;
  // All contact details are snapshotted into the payload at enqueue time.
  // The handler requires no DB reads — the payload is self-contained.
  offerTitle: string;
  senderEmail: string;
  senderName: string;
  recipientEmail: string;
  recipientName: string;
  // ISO-8601 string — Dates do not survive JSON serialisation.
  acceptedAt: string;
  // Empty string when certificate generation failed (rare).
  // The email templates handle an empty certificateId gracefully.
  certificateId: string;
  // SHA-256 hex hash of the certificate payload — included in confirmation emails
  // so recipients retain cryptographic proof even if the platform is unavailable.
  certificateHash: string;
  // Full URL to the certificate verify page, e.g. https://app.offeraccept.com/verify/{id}
  verifyUrl: string;
  // X-Request-ID of the originating HTTP request — carried for log correlation.
  // Undefined for jobs enqueued outside a request context.
  traceId?: string;
}

// ── Discriminated union of all registered jobs ───────────────────────────────

export type JobName = keyof JobPayloadMap;

export interface JobPayloadMap {
  'expire-sessions': ExpireSessionsPayload;
  'expire-offers': ExpireOffersPayload;
  'issue-certificate': IssueCertificatePayload;
  'send-email': SendEmailPayload;
  'send-webhook': SendWebhookPayload;
  'reset-monthly-billing': ResetMonthlyBillingPayload;
  'send-reminders': SendRemindersPayload;
  'notify-deal-accepted': NotifyDealAcceptedPayload;
  'reconcile-certificates': ReconcileCertificatesPayload;
}

// ── Queue-level retry + TTL defaults ─────────────────────────────────────────
// Applied once at startup via boss.createQueue(name, options).
// Jobs that exhaust retryLimit go to pgboss.archive (the DLQ).
//
// Retry schedule with retryBackoff=true (exponential):
//   attempt 1: +retryDelay s
//   attempt 2: +retryDelay * 2^1 s
//   attempt 3: +retryDelay * 2^2 s

export const QUEUE_OPTIONS: Record<JobName, QueueOptions> = {
  'send-reminders': {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 300, // 5 min — each sweep is fast
  },
  'expire-sessions': {
    retryLimit: 3,
    retryDelay: 30,       // 30 s, 60 s, 120 s
    retryBackoff: true,
    expireInSeconds: 300, // kill after 5 min if stuck
  },
  'expire-offers': {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
  },
  'issue-certificate': {
    retryLimit: 5,
    retryDelay: 60,        // 1 min, 2 min, 4 min, 8 min, 16 min
    retryBackoff: true,
    expireInSeconds: 3600, // kill after 1 h
  },
  'send-email': {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 1800,
  },
  'notify-deal-accepted': {
    // Acceptance confirmation emails — high value, generous retry window.
    // Retry schedule (exponential): 1 min → 2 min → 4 min → 8 min → 16 min.
    // Total window: ~31 min before archival to DLQ.
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 3600, // kill if stuck for > 1 h
  },
  'send-webhook': {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 3600,
  },
  'reset-monthly-billing': {
    retryLimit: 3,
    retryDelay: 300,        // 5 min gaps — no rush
    retryBackoff: false,
    expireInSeconds: 3600,
  },
  'reconcile-certificates': {
    // Lightweight cron sweep — runs every 15 minutes.
    // Must complete within 5 minutes; retried twice on transient failures.
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: false,
    expireInSeconds: 300,
  },
};
