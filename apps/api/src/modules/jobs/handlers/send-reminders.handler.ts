import * as crypto from 'crypto';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';
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
          this.logger.warn(JSON.stringify({ event: 'stale_schedule_delete_failed', scheduleId: schedule.id, error: String(e) })),
        );
        continue;
      }

      const recipient = offer.recipient;
      const snapshot  = offer.snapshot;

      if (!recipient || !snapshot) {
        this.logger.warn(JSON.stringify({ event: 'reminder_schedule_skipped', scheduleId: schedule.id, reason: 'missing_recipient_or_snapshot' }));
        continue;
      }

      // Generate a candidate signing token.
      //
      // IMPORTANT — order of operations:
      //   1. Generate token (candidate — not yet in DB)
      //   2. Send reminder email using the candidate signing URL
      //   3. Only if send succeeds, persist the new tokenHash in the DB
      //
      // Rationale: if we write the new tokenHash first and the email send
      // subsequently fails, the OLD signing link is permanently dead and the
      // recipient has received no replacement. By sending first and writing
      // second, the existing token remains valid until delivery is confirmed.
      //
      // Failure path: email fails → tokenHash not rotated → old link still
      // valid → schedule not advanced → next sweep retries with a fresh
      // candidate token.
      //
      // Partial-write path: email succeeds but the DB update below fails →
      // recipient received a link whose tokenHash isn't yet in the DB.  The
      // old link is still in the DB and still works.  The next sweep generates
      // another candidate, and if its DB write succeeds, both the old link
      // (now replaced) and the previously-sent-but-never-persisted link are
      // dead.  The new link from the retried sweep is live.  The net effect is
      // one extra reminder email — acceptable.
      const tokenExpiry = offer.expiresAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const { rawToken, tokenHash, tokenExpiresAt } = generateRecipientToken(tokenExpiry);

      const signingUrl = `${webBaseUrl}/accept/${rawToken}`;
      const newCount   = (schedule.reminderCount + 1) as 1 | 2 | 3;
      const variant    = recipientStatusToVariant(recipient.status);

      // ── Pre-send re-check (serialization guard) ──────────────────────────────
      // Re-reads offer.status inside a fresh transaction immediately before
      // sending. If acceptance committed after the outer findMany, we see
      // ACCEPTED here and skip — closing the race window to near-zero (the
      // remaining gap is only the email API call latency, not the full sweep).
      //
      // This works correctly because the acceptance transaction now deletes
      // the ReminderSchedule row atomically alongside the status change. Once
      // that commit lands, any re-check in READ COMMITTED will see ACCEPTED and
      // the schedule row will be gone — consistent in both directions.
      const offerStillSent = await this.db.$transaction(async (tx) => {
        const fresh = await tx.offer.findUnique({
          where: { id: offer.id },
          select: { status: true },
        });
        if (fresh?.status !== 'SENT') {
          await tx.reminderSchedule.deleteMany({ where: { id: schedule.id } }).catch(() => {});
          return false;
        }
        return true;
      });

      if (!offerStillSent) {
        this.logger.log(JSON.stringify({
          event: 'reminder_skipped_concurrent_state_change',
          scheduleId: schedule.id,
          offerId: offer.id,
        }));
        continue;
      }

      // ── Step 1: attempt email delivery ──────────────────────────────────────
      // On failure: skip this schedule — tokenHash NOT rotated, old link
      // still valid, schedule remains eligible for retry on the next sweep.
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
      } catch (err) {
        this.logger.error(
          JSON.stringify({
            event: 'reminder_send_failed',
            offerId: offer.id,
            reminderNumber: newCount,
            variant,
            recipientEmail: recipient.email,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        // Do NOT rotate tokenHash — old link remains valid.
        // Do NOT advance the schedule — next sweep will retry.
        continue;
      }

      // ── Step 2: persist the new tokenHash only after confirmed delivery ──────
      // The old tokenHash is replaced here. Any prior link is now superseded.
      await this.db.offerRecipient.update({
        where: { id: recipient.id },
        data: { tokenHash, tokenExpiresAt },
      });

      void this.dealEventService.emit(offer.id, 'deal.reminder_sent', { reminderNumber: newCount, variant });
      this.logger.log(JSON.stringify({
        event: 'reminder_sent',
        offerId: offer.id,
        reminderNumber: newCount,
        variant,
        recipientEmail: recipient.email,
      }));

      // Advance the schedule.
      const nextAt =
        newCount < 3
          ? new Date(schedule.dealSentAt.getTime() + REMINDER_OFFSETS_MS[newCount as 1 | 2])
          : null; // all reminders sent; keep row alive for expiry warnings

      // P2025 guard: schedule row deleted between re-check and here (extremely
      // rare — acceptance committed in the narrow window after our $transaction
      // but before this write). Email already sent; log and move on.
      try {
        await this.db.reminderSchedule.update({
          where: { id: schedule.id },
          data: { reminderCount: newCount, nextReminderAt: nextAt },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          this.logger.warn(JSON.stringify({
            event: 'reminder_schedule_advance_missed',
            scheduleId: schedule.id,
            offerId: offer.id,
            reminderNumber: newCount,
          }));
        } else {
          throw err;
        }
      }
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
        this.logger.log(JSON.stringify({ event: 'expiry_warning_sent', offerId: offer.id, warningLevel: '24h' }));
      } catch (err) {
        this.logger.error(
          JSON.stringify({ event: 'expiry_warning_send_failed', offerId: offer.id, warningLevel: '24h' }),
          err instanceof Error ? err.message : String(err),
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
        this.logger.log(JSON.stringify({ event: 'expiry_warning_sent', offerId: offer.id, warningLevel: '2h' }));
      } catch (err) {
        this.logger.error(
          JSON.stringify({ event: 'expiry_warning_send_failed', offerId: offer.id, warningLevel: '2h' }),
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
}
