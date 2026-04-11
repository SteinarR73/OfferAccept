import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { JOB_BOSS, JobService } from './job.service';
import { JobWorker } from './job.worker';
import { JobScheduler } from './job.scheduler';
import { JobTrackingService } from './job-tracking.service';
import { ExpireSessionsHandler } from './handlers/expire-sessions.handler';
import { ExpireOffersHandler } from './handlers/expire-offers.handler';
import { IssueCertificateHandler } from './handlers/issue-certificate.handler';
// SendEmailHandler is NOT registered as a provider — it is a stub, not wired into JobWorker.
// Add it back here when the handler is implemented and ready for activation.
import { SendWebhookHandler } from './handlers/send-webhook.handler';
import { ResetMonthlyBillingHandler } from './handlers/reset-monthly-billing.handler';
import { SendRemindersHandler } from './handlers/send-reminders.handler';
import { NotifyDealAcceptedHandler } from './handlers/notify-deal-accepted.handler';
import { ReconcileCertificatesHandler } from './handlers/reconcile-certificates.handler';
import { GenerateCertificatePdfHandler } from './handlers/generate-certificate-pdf.handler';
import { ArchiveDealEventsHandler } from './handlers/archive-deal-events.handler';
import { CertificatesModule } from '../certificates/certificates.module';
import { BillingModule } from '../billing/billing.module';
import { EnterpriseCoreModule } from '../enterprise/enterprise-core.module';
import { NotificationsModule } from '../notifications/notifications.module';

// ─── JobsModule ────────────────────────────────────────────────────────────────
// Global module providing:
//   JOB_BOSS   — the PgBoss instance (infrastructure; inject only in JobService/Worker)
//   JobService — typed enqueue API (inject in business services that produce jobs)
//
// pg-boss uses the same PostgreSQL database as Prisma (DATABASE_URL).
// It manages its own schema under the `pgboss` namespace — no manual migrations.
//
// Module startup order:
//   JobWorker.onApplicationBootstrap()   → boss.start(), createQueues, work()
//   JobScheduler.onApplicationBootstrap() → boss.schedule() for cron jobs
//
// NestJS guarantees OnApplicationBootstrap hooks run after all providers are
// resolved and injected, so the PgBoss instance is ready when workers register.
//
// Dead-letter queue (DLQ):
//   pg-boss archives exhausted jobs to pgboss.archive automatically.
//   Query: SELECT * FROM pgboss.archive WHERE name = '<job>' ORDER BY archivedon DESC;
//
// Monitoring:
//   SELECT name, state, count(*) FROM pgboss.job GROUP BY name, state;

@Global()
@Module({
  imports: [CertificatesModule, BillingModule, EnterpriseCoreModule, NotificationsModule],
  providers: [
    // ── pg-boss instance ───────────────────────────────────────────────────────
    {
      provide: JOB_BOSS,
      useFactory: (config: ConfigService): PgBoss => {
        const connectionString = config.getOrThrow<string>('DATABASE_URL');
        const logger = new Logger('PgBoss');

        const boss = new PgBoss({
          connectionString,
          // Emit warnings as structured log messages rather than console.warn.
          persistWarnings: true,
        });

        boss.on('error', (err: Error) => logger.error('pg-boss error', err.message, err.stack));

        return boss;
      },
      inject: [ConfigService],
    },

    // ── Lifecycle + scheduling ──────────────────────────────────────────────────
    JobService,
    JobWorker,
    JobScheduler,
    JobTrackingService,

    // ── Handlers ───────────────────────────────────────────────────────────────
    ExpireSessionsHandler,
    ExpireOffersHandler,
    IssueCertificateHandler,
    // SendEmailHandler deliberately omitted — stub, not yet wired into JobWorker.
    // When implementing: add it here, add it back to JobWorker constructor + work() call.
    SendWebhookHandler,
    ResetMonthlyBillingHandler,
    SendRemindersHandler,
    NotifyDealAcceptedHandler,
    ReconcileCertificatesHandler,
    GenerateCertificatePdfHandler,
    ArchiveDealEventsHandler,
  ],
  exports: [JobService, JobTrackingService],
})
export class JobsModule {}
