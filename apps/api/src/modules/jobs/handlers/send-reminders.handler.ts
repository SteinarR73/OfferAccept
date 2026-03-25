import * as crypto from 'crypto';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'pg-boss';
import type { SendRemindersPayload } from '../job.types';
import { EMAIL_PORT, EmailPort, ReminderVariant } from '../../../common/email/email.port';
import { DealEventService } from '../../deal-events/deal-events.service';

// ─── SendRemindersHandler ──────────────────────────────────────────────────────
//
// Cron sweep (every 5 minutes) that:
//
//   A) Sends scheduled reminders to recipients who have not yet accepted.
//      Reads ReminderSchedule rows where nextReminderAt <= now.
//      Regenerates a fresh signing token for each reminder (same pattern as resend).
//      Adapts the email copy to the recipient's engagement state:
//        - PENDING      → "agreement waiting for your review"
//        - VIEWED       → "agreement awaiting your confirmation"
//        - OTP_VERIFIED → "complete your confirmation"
//
//   B) Sends expiry warnings to deal senders.
//      24 h warning: offer expires within 24 h, warning not yet sent.
//       2 h warning: offer expires within 2 h, warning not yet sent.
//
// Idempotency:
//   Each reminder schedule update sets reminderCount and nextReminderAt atomically.
//   Expiry warning flags (warning24hSentAt / warning2hSentAt) are set before the
//   email is sent, so a crash after DB write is safer than a crash after email send.
//   Duplicate-send risk on crash after flag write is low — one extra warning email
//   is far less harmful than no warning.
//
// Self-healing:
//   If a ReminderSchedule exists for a non-SENT offer (e.g., the offer was accepted
//   but the schedule was not cleaned up), the handler deletes the stale row and skips.
//
// Token security:
//   Raw tokens are generated here and never logged above DEBUG. Only the tokenHash
//   is persisted.

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Absolute offsets from dealSentAt for each reminder. */
const REMINDER_OFFSETS_MS: [number, number, number] = [
  24 * 60 * 60 * 1000,   // R1: 24 h
  72 * 60 * 60 * 1000,   // R2: 72 h
  120 * 60 * 60 * 1000,  // R3: 5 days
];

/** Warn sender 24 h before expiry. */
const WARN_24H_MS = 24 * 60 * 60 * 1000;

/** Warn sender 2 h before expiry. */
const WARN_2H_MS = 2 * 60 * 60 * 1000;

/**
 * Buffer added to the warning window upper bound so we don't miss the window
 * due to job-scheduling jitter (job runs every 5 min, so ≤ 5.5 min buffer).
 */
const JOB_BUFFER_MS = 5 * 60 * 1000 + 30_000;

// ─── Token generation (mirrors send-offer.service.ts) ─────────────────────────

function generateRecipientToken(expiresAt: Date): {
  rawToken: string;
  tokenHash: string;
  tokenExpiresAt: Date;
} {
  const rawToken = 'oa_' + crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  return { rawToken, tokenHash, tokenExpiresAt: expiresAt };
}

// ─── Recipient-status → reminder variant mapping ──────────────────────────────

function recipientStatusToVariant(status: string): ReminderVariant {
  if (status === 'OTP_VERIFIED') return 'otp_started';
  if (status === 'VIEWED')       return 'opened';
  return 'not_opened';
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@Injectable()
export class SendRemindersHandler {
  private readonly logger = new Logger(SendRemindersHandler.name);

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    private readonly config: ConfigService,
    private readonly dealEventService: DealEventService,
  ) {}

  async handle(jobs: Job<SendRemindersPayload>[]): Promise<void> {
    const now = new Date();
    void jobs; // cron-triggered sweep — no per-job payload used

    await this.sendDueReminders(now);
    await this.sendExpiryWarnings(now);
  }

  // ─── A. Recipient reminders ────────────────────────────────────────────────

  private async sendDueReminders(now: Date): Promise<void> {
    const schedules = await this.db.reminderSchedule.findMany({
      where: {
        nextReminderAt: { lte: now },
        reminderCount: { lt: 3 },
      },
      include: {
        offer: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            recipient: {
              select: { id: true, email: true, name: true, status: true },
            },
            snapshot: {
              select: { title: true, senderName: true, expiresAt: true },
            },
          },
        },
      },
    });

    if (schedules.length === 0) return;

    const webBaseUrl = this.config.getOrThrow<string>('WEB_BASE_URL');

    for (const schedule of schedules) {
      const { offer } = schedule;

      // Self-heal: delete stale schedule if the offer is no longer SENT.
      if (offer.status !== 'SENT') {
        await this.db.reminderSchedule.delete({ where: { id: schedule.id } }).catch((e: unknown) =>
          this.logger.warn(`Failed to delete stale schedule ${schedule.id}: ${e}`),
        );
        continue;
      }

      const recipient = offer.recipient;
      const snapshot  = offer.snapshot;

      if (!recipient || !snapshot) {
        this.logger.warn(`ReminderSchedule ${schedule.id}: missing recipient or snapshot — skipping`);
        continue;
      }

      // Generate a fresh signing token so the reminder contains a live link.
      const tokenExpiry = offer.expiresAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { rawToken, tokenHash, tokenExpiresAt } = generateRecipientToken(tokenExpiry);

      await this.db.offerRecipient.update({
        where: { id: recipient.id },
        data: { tokenHash, tokenExpiresAt },
      });

      const signingUrl = `${webBaseUrl}/sign/${rawToken}`;
      const newCount   = (schedule.reminderCount + 1) as 1 | 2 | 3;
      const variant    = recipientStatusToVariant(recipient.status);

      // Send reminder email — best-effort (log failures, keep processing).
      try {
        await this.emailPort.sendRecipientReminder({
          to: recipient.email,
          recipientName: recipient.name,
          offerTitle: snapshot.title,
          senderName: snapshot.senderName,
          signingUrl,
          expiresAt: offer.expiresAt,
          variant,
          reminderNumber: newCount,
        });
        void this.dealEventService.emit(offer.id, 'deal_reminder_sent', { reminderNumber: newCount, variant });
        this.logger.log(
          `Reminder #${newCount} (${variant}) sent to ${recipient.email} for offer ${offer.id}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to send reminder #${newCount} to ${recipient.email} for offer ${offer.id}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
        // Do NOT update the schedule — let the next sweep retry.
        continue;
      }

      // Advance the schedule.
      const nextAt =
        newCount < 3
          ? new Date(schedule.dealSentAt.getTime() + REMINDER_OFFSETS_MS[newCount as 1 | 2])
          : null; // all reminders sent; keep row alive for expiry warnings

      await this.db.reminderSchedule.update({
        where: { id: schedule.id },
        data: { reminderCount: newCount, nextReminderAt: nextAt },
      });
    }
  }

  // ─── B. Sender expiry warnings ─────────────────────────────────────────────

  private async sendExpiryWarnings(now: Date): Promise<void> {
    await this.send24hWarnings(now);
    await this.send2hWarnings(now);
  }

  private async send24hWarnings(now: Date): Promise<void> {
    const windowEnd = new Date(now.getTime() + WARN_24H_MS + JOB_BUFFER_MS);
    const windowStart = new Date(now.getTime() + WARN_2H_MS + JOB_BUFFER_MS); // don't overlap with 2h

    const schedules = await this.db.reminderSchedule.findMany({
      where: {
        warning24hSentAt: null,
        offer: {
          status: 'SENT',
          expiresAt: {
            gt: windowStart,  // expires in more than ~2h (avoid double-warning)
            lte: windowEnd,   // expires within ~24h
          },
        },
      },
      include: {
        offer: {
          select: {
            id: true,
            expiresAt: true,
            snapshot: { select: { title: true, senderName: true, senderEmail: true } },
          },
        },
      },
    });

    for (const schedule of schedules) {
      const { offer } = schedule;
      if (!offer.snapshot || !offer.expiresAt) continue;

      // Mark as sent before sending — idempotency-safe: a crash here means
      // one missed warning; a crash after send could mean a duplicate.
      await this.db.reminderSchedule.update({
        where: { id: schedule.id },
        data: { warning24hSentAt: now },
      });

      try {
        await this.emailPort.sendExpiryWarning({
          to: offer.snapshot.senderEmail,
          senderName: offer.snapshot.senderName,
          offerTitle: offer.snapshot.title,
          expiresAt: offer.expiresAt,
          warningLevel: '24h',
        });
        this.logger.log(`24h expiry warning sent to ${offer.snapshot.senderEmail} for offer ${offer.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to send 24h expiry warning to ${offer.snapshot.senderEmail} for offer ${offer.id}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async send2hWarnings(now: Date): Promise<void> {
    const windowEnd = new Date(now.getTime() + WARN_2H_MS + JOB_BUFFER_MS);

    const schedules = await this.db.reminderSchedule.findMany({
      where: {
        warning2hSentAt: null,
        offer: {
          status: 'SENT',
          expiresAt: {
            gt: now,         // not yet expired
            lte: windowEnd,  // expires within ~2h
          },
        },
      },
      include: {
        offer: {
          select: {
            id: true,
            expiresAt: true,
            snapshot: { select: { title: true, senderName: true, senderEmail: true } },
          },
        },
      },
    });

    for (const schedule of schedules) {
      const { offer } = schedule;
      if (!offer.snapshot || !offer.expiresAt) continue;

      await this.db.reminderSchedule.update({
        where: { id: schedule.id },
        data: { warning2hSentAt: now },
      });

      try {
        await this.emailPort.sendExpiryWarning({
          to: offer.snapshot.senderEmail,
          senderName: offer.snapshot.senderName,
          offerTitle: offer.snapshot.title,
          expiresAt: offer.expiresAt,
          warningLevel: '2h',
        });
        this.logger.log(`2h expiry warning sent to ${offer.snapshot.senderEmail} for offer ${offer.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to send 2h expiry warning to ${offer.snapshot.senderEmail} for offer ${offer.id}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
