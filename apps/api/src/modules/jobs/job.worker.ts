import {
  Injectable,
  Inject,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import type { WorkOptions, Job } from 'pg-boss';
import { JOB_BOSS } from './job.service';
import { QUEUE_OPTIONS, JobName, JobPayloadMap } from './job.types';
import { ExpireSessionsHandler } from './handlers/expire-sessions.handler';
import { ExpireOffersHandler } from './handlers/expire-offers.handler';
import { IssueCertificateHandler } from './handlers/issue-certificate.handler';
// SendEmailHandler is intentionally NOT registered here — the handler is a stub.
// Current email flow: synchronous via EmailPort (fire-and-forget, sufficient for current volume).
// To activate async email: implement SendEmailHandler, then re-add it here.
// See: handlers/send-email.handler.ts for the activation checklist.
import { SendWebhookHandler } from './handlers/send-webhook.handler';
import { ResetMonthlyBillingHandler } from './handlers/reset-monthly-billing.handler';
import { SendRemindersHandler } from './handlers/send-reminders.handler';
import { NotifyDealAcceptedHandler } from './handlers/notify-deal-accepted.handler';
import { ReconcileCertificatesHandler } from './handlers/reconcile-certificates.handler';
import { GenerateCertificatePdfHandler } from './handlers/generate-certificate-pdf.handler';

// ─── JobWorker ─────────────────────────────────────────────────────────────────
// Lifecycle service that owns the pg-boss start/stop sequence and registers all
// job handlers.
//
// Bootstrap sequence (OnApplicationBootstrap):
//   1. boss.start()       — connects to PostgreSQL, runs schema migrations
//   2. createQueue()      — creates/updates each queue with its retry policy
//   3. boss.work()        — registers a polling handler per queue
//
// Shutdown sequence (OnApplicationShutdown):
//   boss.stop({ graceful: true }) — waits for in-flight jobs (up to 30 s).
//
// Handler contract:
//   - Return void = success (pg-boss marks job completed)
//   - Throw      = failure (pg-boss marks job failed, schedules retry)
//   - Handlers MUST be idempotent (pg-boss retries on failure)
//
// Worker concurrency (localConcurrency):
//   Controls how many concurrent workers poll the queue per process.
//   For sweep jobs (expire-*) 1 is sufficient — one batch per tick.
//   For event-driven jobs increase to match expected throughput.
//
// ─── Monitoring & Alerting ──────────────────────────────────────────────────
//
// Structured log metrics (query in your log aggregator by the `metric` field):
//
//   metric=rate_limit_exceeded      — alert if > 50/min sustained
//                                     (spike on otp_verification/login = attack)
//   metric=rate_limit_redis_error   — alert on any occurrence (Redis down)
//   metric=email_delivery_failed    — alert on > 3 in 5 min (Resend outage)
//   event=certificate_dlq_risk      — alert on any occurrence (cert gen failing)
//   metric=notify_deal_accepted_failed — alert if job lands in DLQ (lost email)
//
// DLQ alert — run every hour, alert if count > 0 for critical queues:
//   SELECT name, count(*), max(archivedon) AS latest
//   FROM pgboss.archive
//   WHERE archivedon > now() - interval '1 hour'
//   GROUP BY name ORDER BY count DESC;
//
// Critical queues (DLQ tolerance = 0): issue-certificate, notify-deal-accepted
// Best-effort queues (DLQ tolerance > 0 ok): send-webhook, send-reminders
//
// Job lag alert — stuck jobs (created but not picked up within expected window):
//   SELECT name, count(*), min(createdon) AS oldest
//   FROM pgboss.job
//   WHERE state = 'created'
//   GROUP BY name
//   HAVING min(createdon) < now() - interval '15 minutes';
//
// Job failure rate — jobs that failed at least once (monitor for rising trend):
//   SELECT name, state, count(*)
//   FROM pgboss.job
//   WHERE createdon > now() - interval '1 hour'
//   GROUP BY name, state ORDER BY name, state;

const WORKER_OPTIONS: Record<Exclude<JobName, 'send-email'>, WorkOptions> = {
  'expire-sessions':              { batchSize: 1, localConcurrency: 1 },
  'expire-offers':                { batchSize: 1, localConcurrency: 1 },
  'issue-certificate':            { batchSize: 5, localConcurrency: 3 },
  // 'send-email' deliberately omitted — handler is a stub, not registered as a worker.
  // Restore this entry when the handler is implemented.
  'send-webhook':                 { batchSize: 5, localConcurrency: 5 },
  'reset-monthly-billing':        { batchSize: 1, localConcurrency: 1 },
  'send-reminders':               { batchSize: 1, localConcurrency: 1 },
  // Each job delivers two emails for a single accepted deal — small batches are fine.
  'notify-deal-accepted':         { batchSize: 5, localConcurrency: 3 },
  // Cron sweep — one job per tick, no concurrency needed.
  'reconcile-certificates':       { batchSize: 1, localConcurrency: 1 },
  // PDF generation is I/O-bound; moderate concurrency is appropriate.
  'generate-certificate-pdf':     { batchSize: 5, localConcurrency: 3 },
};

@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobWorker.name);

  constructor(
    @Inject(JOB_BOSS) private readonly boss: PgBoss,
    private readonly expireSessions: ExpireSessionsHandler,
    private readonly expireOffers: ExpireOffersHandler,
    private readonly issueCertificate: IssueCertificateHandler,
    // SendEmailHandler deliberately not injected — it is a stub.
    // See comment above WORKER_OPTIONS for re-activation steps.
    private readonly sendWebhook: SendWebhookHandler,
    private readonly resetMonthlyBilling: ResetMonthlyBillingHandler,
    private readonly sendReminders: SendRemindersHandler,
    private readonly notifyDealAccepted: NotifyDealAcceptedHandler,
    private readonly reconcileCertificates: ReconcileCertificatesHandler,
    private readonly generateCertificatePdf: GenerateCertificatePdfHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Starting pg-boss…');
    await this.boss.start();
    this.logger.log('pg-boss started');

    // Create/update queues with their retry policies.
    for (const [name, opts] of Object.entries(QUEUE_OPTIONS) as [JobName, (typeof QUEUE_OPTIONS)[JobName]][]) {
      await this.boss.createQueue(name, opts);
    }
    this.logger.log('Queues created/updated');

    // Register workers — one call per queue.
    // The handler receives an array of jobs (batchSize controls the max batch length).
    await this.boss.work<JobPayloadMap['expire-sessions']>(
      'expire-sessions',
      WORKER_OPTIONS['expire-sessions'],
      (jobs: Job<JobPayloadMap['expire-sessions']>[]) => this.expireSessions.handle(jobs),
    );

    await this.boss.work<JobPayloadMap['expire-offers']>(
      'expire-offers',
      WORKER_OPTIONS['expire-offers'],
      (jobs: Job<JobPayloadMap['expire-offers']>[]) => this.expireOffers.handle(jobs),
    );

    await this.boss.work<JobPayloadMap['issue-certificate']>(
      'issue-certificate',
      WORKER_OPTIONS['issue-certificate'],
      (jobs: Job<JobPayloadMap['issue-certificate']>[]) => this.issueCertificate.handle(jobs),
    );

    // NOTE: 'send-email' worker is intentionally NOT registered here.
    // The send-email queue exists in pg-boss (queue config is retained in job.types.ts
    // for forward-compatibility), but no worker polls it until the handler is implemented.
    // Current email delivery: synchronous via EmailPort — sufficient for current volume.

    await this.boss.work<JobPayloadMap['send-webhook']>(
      'send-webhook',
      WORKER_OPTIONS['send-webhook'],
      (jobs: Job<JobPayloadMap['send-webhook']>[]) => this.sendWebhook.handle(jobs),
    );

    await this.boss.work<JobPayloadMap['reset-monthly-billing']>(
      'reset-monthly-billing',
      WORKER_OPTIONS['reset-monthly-billing'],
      (jobs: Job<JobPayloadMap['reset-monthly-billing']>[]) => this.resetMonthlyBilling.handle(jobs),
    );

    await this.boss.work<JobPayloadMap['send-reminders']>(
      'send-reminders',
      WORKER_OPTIONS['send-reminders'],
      (jobs: Job<JobPayloadMap['send-reminders']>[]) => this.sendReminders.handle(jobs),
    );

    await this.boss.work<JobPayloadMap['notify-deal-accepted']>(
      'notify-deal-accepted',
      WORKER_OPTIONS['notify-deal-accepted'],
      (jobs: Job<JobPayloadMap['notify-deal-accepted']>[]) => this.notifyDealAccepted.handle(jobs),
    );

    await this.boss.work<JobPayloadMap['reconcile-certificates']>(
      'reconcile-certificates',
      WORKER_OPTIONS['reconcile-certificates'],
      (jobs: Job<JobPayloadMap['reconcile-certificates']>[]) => this.reconcileCertificates.handle(jobs),
    );

    await this.boss.work<JobPayloadMap['generate-certificate-pdf']>(
      'generate-certificate-pdf',
      WORKER_OPTIONS['generate-certificate-pdf'],
      (jobs: Job<JobPayloadMap['generate-certificate-pdf']>[]) => this.generateCertificatePdf.handle(jobs),
    );

    this.logger.log('All job workers registered');
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Stopping pg-boss (signal: ${signal ?? 'none'})…`);
    await this.boss.stop({ graceful: true, timeout: 30_000 });
    this.logger.log('pg-boss stopped');
  }
}
