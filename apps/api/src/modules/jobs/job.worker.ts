import {
  Injectable,
  Inject,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import type { WorkOptions, Job } from 'pg-boss';
import { SpanStatusCode } from '@opentelemetry/api';
import { JOB_BOSS } from './job.service';
import { QUEUE_OPTIONS, JobName, JobPayloadMap } from './job.types';
import { JobTrackingService } from './job-tracking.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { getAppTracer } from '../../instrument';
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
import { ArchiveDealEventsHandler } from './handlers/archive-deal-events.handler';
import { PurgeExpiredSigningDataHandler } from './handlers/purge-expired-signing-data.handler';

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
  // Cron sweep — one job per tick, no concurrency needed.
  'archive-deal-events':          { batchSize: 1, localConcurrency: 1 },
  // Cron sweep — deletes mutable signing session data past retention period.
  'purge-expired-signing-data':   { batchSize: 1, localConcurrency: 1 },
};

@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobWorker.name);

  constructor(
    @Inject(JOB_BOSS) private readonly boss: PgBoss,
    private readonly jobTracking: JobTrackingService,
    private readonly metrics: MetricsService,
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
    private readonly archiveDealEvents: ArchiveDealEventsHandler,
    private readonly purgeExpiredSigningData: PurgeExpiredSigningDataHandler,
  ) {}

  // ── trackAndHandle ─────────────────────────────────────────────────────────
  // Wraps a pg-boss batch handler with three cross-cutting concerns:
  //   1. Job tracking (claimJob / completeJob / failJob in the jobs DB table)
  //   2. Metrics (job_duration_ms histogram with job_name + status labels)
  //   3. OTel distributed tracing (one span per job, forwarded to Sentry)
  //
  // Jobs are processed one-at-a-time so each can be tracked independently.
  // Failures re-throw so pg-boss knows to schedule a retry.
  private async trackAndHandle<N extends JobName>(
    name: N,
    jobs: Job<JobPayloadMap[N]>[],
    handle: (jobs: Job<JobPayloadMap[N]>[]) => Promise<void>,
  ): Promise<void> {
    const tracer = getAppTracer();

    for (const job of jobs) {
      await this.jobTracking.claimJob(job.id, name, job.data);
      const startMs = Date.now();

      // One OTel span per job execution. Sentry v9 captures these automatically
      // because it registers the OTel TracerProvider in instrument.ts.
      // When Sentry is absent (dev), `startActiveSpan` uses a no-op tracer.
      await tracer.startActiveSpan(
        `job.${name}`,
        { attributes: { 'job.id': job.id, 'job.name': name, 'messaging.operation': 'process' } },
        async (span) => {
          try {
            await handle([job]);
            await this.jobTracking.completeJob(job.id);
            span.setStatus({ code: SpanStatusCode.OK });
            this.metrics.recordJobDuration(name, Date.now() - startMs, true);
          } catch (err: unknown) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err instanceof Error ? err.message : String(err),
            });
            span.recordException(err instanceof Error ? err : new Error(String(err)));
            await this.jobTracking.failJob(job.id, err);
            this.metrics.recordJobDuration(name, Date.now() - startMs, false);
            throw err; // re-throw so pg-boss marks the job failed and schedules retry
          } finally {
            span.end();
          }
        },
      );
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    // Stale lock recovery runs before workers register so that any jobs left
    // RUNNING from a previous crashed process are reset before new deliveries
    // arrive. JobTrackingService.onApplicationBootstrap() is called by NestJS
    // automatically, but the order of lifecycle hooks across providers is not
    // guaranteed — invoking it explicitly here ensures ordering.
    await this.jobTracking.onApplicationBootstrap();

    this.logger.log('Starting pg-boss…');
    await this.boss.start();
    this.logger.log('pg-boss started');

    // Create/update queues with their retry policies.
    for (const [name, opts] of Object.entries(QUEUE_OPTIONS) as [JobName, (typeof QUEUE_OPTIONS)[JobName]][]) {
      await this.boss.createQueue(name, opts);
    }
    this.logger.log('Queues created/updated');

    // Register workers. Each handler is wrapped with trackAndHandle so that
    // every delivery attempt is recorded in the jobs table with its outcome.
    // Jobs are processed one-at-a-time within a batch so failures can be
    // tracked independently — a batch-level throw would lose per-job context.
    await this.boss.work<JobPayloadMap['expire-sessions']>(
      'expire-sessions',
      WORKER_OPTIONS['expire-sessions'],
      (jobs) => this.trackAndHandle('expire-sessions', jobs, (j) => this.expireSessions.handle(j)),
    );

    await this.boss.work<JobPayloadMap['expire-offers']>(
      'expire-offers',
      WORKER_OPTIONS['expire-offers'],
      (jobs) => this.trackAndHandle('expire-offers', jobs, (j) => this.expireOffers.handle(j)),
    );

    await this.boss.work<JobPayloadMap['issue-certificate']>(
      'issue-certificate',
      WORKER_OPTIONS['issue-certificate'],
      (jobs) => this.trackAndHandle('issue-certificate', jobs, (j) => this.issueCertificate.handle(j)),
    );

    // NOTE: 'send-email' worker is intentionally NOT registered here.
    // The send-email queue exists in pg-boss (queue config is retained in job.types.ts
    // for forward-compatibility), but no worker polls it until the handler is implemented.
    // Current email delivery: synchronous via EmailPort — sufficient for current volume.

    await this.boss.work<JobPayloadMap['send-webhook']>(
      'send-webhook',
      WORKER_OPTIONS['send-webhook'],
      (jobs) => this.trackAndHandle('send-webhook', jobs, (j) => this.sendWebhook.handle(j)),
    );

    await this.boss.work<JobPayloadMap['reset-monthly-billing']>(
      'reset-monthly-billing',
      WORKER_OPTIONS['reset-monthly-billing'],
      (jobs) => this.trackAndHandle('reset-monthly-billing', jobs, (j) => this.resetMonthlyBilling.handle(j)),
    );

    await this.boss.work<JobPayloadMap['send-reminders']>(
      'send-reminders',
      WORKER_OPTIONS['send-reminders'],
      (jobs) => this.trackAndHandle('send-reminders', jobs, (j) => this.sendReminders.handle(j)),
    );

    await this.boss.work<JobPayloadMap['notify-deal-accepted']>(
      'notify-deal-accepted',
      WORKER_OPTIONS['notify-deal-accepted'],
      (jobs) => this.trackAndHandle('notify-deal-accepted', jobs, (j) => this.notifyDealAccepted.handle(j)),
    );

    await this.boss.work<JobPayloadMap['reconcile-certificates']>(
      'reconcile-certificates',
      WORKER_OPTIONS['reconcile-certificates'],
      (jobs) => this.trackAndHandle('reconcile-certificates', jobs, (j) => this.reconcileCertificates.handle(j)),
    );

    await this.boss.work<JobPayloadMap['generate-certificate-pdf']>(
      'generate-certificate-pdf',
      WORKER_OPTIONS['generate-certificate-pdf'],
      (jobs) => this.trackAndHandle('generate-certificate-pdf', jobs, (j) => this.generateCertificatePdf.handle(j)),
    );

    await this.boss.work<JobPayloadMap['archive-deal-events']>(
      'archive-deal-events',
      WORKER_OPTIONS['archive-deal-events'],
      (jobs) => this.trackAndHandle('archive-deal-events', jobs, (j) => this.archiveDealEvents.handle(j)),
    );

    await this.boss.work<JobPayloadMap['purge-expired-signing-data']>(
      'purge-expired-signing-data',
      WORKER_OPTIONS['purge-expired-signing-data'],
      (jobs) => this.trackAndHandle('purge-expired-signing-data', jobs, (j) => this.purgeExpiredSigningData.handle(j)),
    );

    this.logger.log('All job workers registered');
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Stopping pg-boss (signal: ${signal ?? 'none'})…`);
    await this.boss.stop({ graceful: true, timeout: 30_000 });
    this.logger.log('pg-boss stopped');
  }
}
