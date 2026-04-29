import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { JOB_BOSS } from './job.service';

// ─── JobScheduler ──────────────────────────────────────────────────────────────
// Registers recurring (cron) job schedules via pg-boss.
//
// pg-boss schedule() vs send():
//   schedule() creates a *named cron schedule* stored in pgboss.schedule.
//   On each cron tick pg-boss calls send() with singletonKey=name, so only one
//   instance of the job is queued even if multiple API pods are running.
//   This makes cron jobs safe for horizontally-scaled deployments out of the box.
//
// Idempotency of schedule() itself:
//   Calling schedule() with the same name and cron updates the stored schedule
//   in-place — safe to run on every app start without creating duplicates.
//
// All cron expressions are UTC.
//
// ── Schedule table ──────────────────────────────────────────────────────────
//
//   Job                        Cron              Description
//   ─────────────────────────  ───────────────   ──────────────────────────────────────────
//   expire-sessions            */5 * * * *       Every 5 minutes
//   expire-offers              */30 * * * *      Every 30 minutes
//   send-reminders             */5 * * * *       Every 5 minutes
//   reconcile-certificates     */15 * * * *      Every 15 minutes
//   reset-monthly-billing      0 0 1 * *         Midnight UTC on 1st of month
//   archive-deal-events        0 2 * * *         02:00 UTC daily
//   purge-expired-signing-data 0 3 * * *         03:00 UTC daily — deletes mutable session/OTP data past retention
//
// issue-certificate, send-email, send-webhook, notify-deal-accepted are
// event-driven — they are enqueued by application code rather than on a schedule.
// reconcile-certificates re-enqueues issue-certificate for any missed certificates.

@Injectable()
export class JobScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobScheduler.name);

  constructor(@Inject(JOB_BOSS) private readonly boss: PgBoss) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.registerSchedules();
  }

  private async registerSchedules(): Promise<void> {
    // expire-sessions: every 5 minutes
    await this.boss.schedule('expire-sessions', '*/5 * * * *', {}, {
      tz: 'UTC',
    });

    // expire-offers: every 30 minutes
    await this.boss.schedule('expire-offers', '*/30 * * * *', {}, {
      tz: 'UTC',
    });

    // send-reminders: every 5 minutes (same cadence as expire-sessions)
    await this.boss.schedule('send-reminders', '*/5 * * * *', {}, {
      tz: 'UTC',
    });

    // reconcile-certificates: every 15 minutes — detects and re-enqueues missing
    // certificates for accepted deals that didn't get one due to transient errors.
    await this.boss.schedule('reconcile-certificates', '*/15 * * * *', {}, {
      tz: 'UTC',
    });

    // reset-monthly-billing: midnight UTC on the 1st of every month
    // Uses a month-stamped singletonKey so re-registration after a restart
    // on the 1st doesn't fire the job again.
    const yearMonth = new Date().toISOString().slice(0, 7); // e.g. '2026-03'
    await this.boss.schedule(
      'reset-monthly-billing',
      '0 0 1 * *',
      {},
      {
        tz: 'UTC',
        singletonKey: `reset-monthly-billing:${yearMonth}`,
      },
    );

    // archive-deal-events: 02:00 UTC daily — moves DealEvent rows older than
    // 18 months to deal_events_archive. Each run processes at most
    // DEAL_EVENT_ARCHIVE_BATCH_SIZE rows (default 10,000); larger backlogs
    // clear progressively over subsequent nightly runs.
    await this.boss.schedule('archive-deal-events', '0 2 * * *', {}, {
      tz: 'UTC',
    });

    // purge-expired-signing-data: 03:00 UTC daily — deletes mutable SigningSession and
    // SigningOtpChallenge rows past the ACCEPTANCE_RETENTION_YEARS threshold.
    // Immutable evidence tables (AcceptanceRecord, OfferSnapshot, SigningEvent) are never touched.
    await this.boss.schedule('purge-expired-signing-data', '0 3 * * *', {}, {
      tz: 'UTC',
    });

    this.logger.log('Cron schedules registered: expire-sessions, expire-offers, reset-monthly-billing, send-reminders, reconcile-certificates, archive-deal-events, purge-expired-signing-data');
  }
}
