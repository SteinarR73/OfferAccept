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
}

export interface ResetMonthlyBillingPayload {
  // Cron-triggered sweep — resets per-org monthly offer counts.
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
};
