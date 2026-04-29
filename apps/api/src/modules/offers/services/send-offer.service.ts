import * as crypto from 'crypto';
import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  OfferNotEditableError,
  OfferNotRevocableError,
  OfferNotResendableError,
} from '../../../common/errors/domain.errors';
import { assertOfferIsComplete } from '../domain/offer-completeness';
import { EMAIL_PORT, EmailPort } from '../../../common/email/email.port';
import { ResendDeliveryError } from '../../../common/email/resend-email.adapter';
import { DealEventService } from '../../deal-events/deal-events.service';
import { SubscriptionService } from '../../billing/subscription.service';
import { MetricsService } from '../../../common/metrics/metrics.service';

// ─── Token generation ─────────────────────────────────────────────────────────
// Mirrors signing-token.service.ts — kept in the offers module to avoid
// coupling the send logic to the signing module.

function generateRecipientToken(expiresAt: Date): {
  rawToken: string;
  tokenHash: string;
  tokenExpiresAt: Date;
} {
  const rawToken = 'oa_' + crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  return { rawToken, tokenHash, tokenExpiresAt: expiresAt };
}

// ─── Snapshot hash computation ────────────────────────────────────────────────
// Matches the spec in docs/architecture.md (Frozen Offer Snapshot section).
// canonical JSON: { title, message, senderName, senderEmail, expiresAt, documents: [...] }
// keys sorted alphabetically, compact, UTF-8.

function computeSnapshotContentHash(input: {
  title: string;
  message: string | null;
  senderName: string;
  senderEmail: string;
  expiresAt: Date | null;
  documents: Array<{ filename: string; storageKey: string; sha256Hash: string }>;
}): string {
  const canonical = JSON.stringify(
    sortObjectKeys({
      documents: input.documents
        .slice()
        .sort((a, b) => a.storageKey.localeCompare(b.storageKey))
        .map((d) => sortObjectKeys({ filename: d.filename, sha256Hash: d.sha256Hash, storageKey: d.storageKey })),
      expiresAt: input.expiresAt?.toISOString() ?? null,
      message: input.message,
      senderEmail: input.senderEmail,
      senderName: input.senderName,
      title: input.title,
    }),
  );
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]]),
  );
}

// ─── Failure info extraction ───────────────────────────────────────────────────
// Extracts structured failure details from a caught email error.
// ResendDeliveryError carries statusCode + providerMessage from the HTTP response.
// Any other error (network timeout, etc.) is treated as an unknown failure.

function extractFailureInfo(err: unknown): { failureCode: number | null; failureReason: string } {
  if (err instanceof ResendDeliveryError) {
    return { failureCode: err.statusCode, failureReason: err.providerMessage };
  }
  if (err instanceof Error) {
    return { failureCode: null, failureReason: err.message };
  }
  return { failureCode: null, failureReason: 'Unknown error' };
}

// ─── SendOfferService ─────────────────────────────────────────────────────────
// Owns the "send" transition: DRAFT → SENT.
//
// The send operation is fully atomic inside a single $transaction:
//   1. Assert offer is DRAFT and complete
//   2. Generate signing token (rawToken never persisted)
//   3. Create immutable OfferSnapshot + OfferSnapshotDocuments
//   4. Upsert OfferRecipient with real tokenHash (replaces draft placeholder)
//   5. Transition Offer to SENT
//
// After the transaction commits:
//   6. Create OfferDeliveryAttempt (DISPATCHING)
//   7. Send offer link email
//   8. Update OfferDeliveryAttempt to DELIVERED_TO_PROVIDER or FAILED
//
// The offer stays SENT regardless of delivery outcome.
// Delivery state is tracked in OfferDeliveryAttempt for operational visibility.
//
// Resend and revoke are also owned here as related state transitions.

export interface SendResult {
  snapshotId: string;
  sentAt: Date;
  deliveryAttemptId: string;
  deliveryOutcome: 'DELIVERED_TO_PROVIDER' | 'FAILED';
}

export interface ResendResult {
  deliveryAttemptId: string;
  deliveryOutcome: 'DELIVERED_TO_PROVIDER' | 'FAILED';
}

export interface DeliveryAttemptRecord {
  id: string;
  outcome: string;
  recipientEmail: string;
  failureCode: number | null;
  failureReason: string | null;
  attemptedBy: string | null;
  attemptedAt: Date;
}

@Injectable()
export class SendOfferService {
  private readonly logger = new Logger(SendOfferService.name);

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    private readonly config: ConfigService,
    private readonly dealEventService: DealEventService,
    private readonly subscriptionService: SubscriptionService,
    private readonly metrics: MetricsService,
  ) {}

  async send(
    offerId: string,
    orgId: string,
    senderName: string,
    senderEmail: string,
  ): Promise<SendResult> {
    // ── Load the offer with all related data ──────────────────────────────────
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, organizationId: orgId, deletedAt: null },
      include: {
        recipient: true,
        documents: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!offer) throw new NotFoundException('Offer not found.');
    if (offer.status !== 'DRAFT') throw new OfferNotEditableError(offer.status);

    // ── Validate completeness ─────────────────────────────────────────────────
    assertOfferIsComplete(offer, offer.recipient, offer.documents);

    // ── Enforce plan limits ───────────────────────────────────────────────────
    // Throws PlanLimitExceededError if the org has reached its monthly quota.
    // Must be checked before the transaction — fail fast before any DB writes.
    await this.subscriptionService.assertCanSendOffer(orgId);

    const recipient = offer.recipient!; // safe after assertOfferIsComplete

    // ── Compute token expiry ──────────────────────────────────────────────────
    // Token expires at offer.expiresAt, or TOKEN_EXPIRY_DAYS from now if unset.
    const tokenExpiryDays = this.config.get<number>('TOKEN_EXPIRY_DAYS', 30);
    const tokenExpiry = offer.expiresAt ?? new Date(Date.now() + tokenExpiryDays * 24 * 60 * 60 * 1000);
    const { rawToken, tokenHash, tokenExpiresAt } = generateRecipientToken(tokenExpiry);

    // ── Compute snapshot content hash ──────────────────────────────────────────
    const contentHash = computeSnapshotContentHash({
      title: offer.title,
      message: offer.message,
      senderName,
      senderEmail,
      expiresAt: offer.expiresAt,
      documents: offer.documents,
    });

    // ── Atomic transaction ────────────────────────────────────────────────────
    const snapshot = await this.db.$transaction(async (tx) => {
      // 1. Create immutable snapshot
      const snap = await tx.offerSnapshot.create({
        data: {
          offerId: offer.id,
          title: offer.title,
          message: offer.message,
          senderName,
          senderEmail,
          expiresAt: offer.expiresAt,
          contentHash,
        },
      });

      // 2. Create immutable snapshot documents
      for (const doc of offer.documents) {
        await tx.offerSnapshotDocument.create({
          data: {
            snapshotId: snap.id,
            documentId: doc.id,
            filename: doc.filename,
            storageKey: doc.storageKey,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            sha256Hash: doc.sha256Hash,
          },
        });
      }

      // 3. Replace draft token placeholder with real token on recipient
      await tx.offerRecipient.update({
        where: { offerId: offer.id },
        data: {
          tokenHash,
          tokenExpiresAt,
          tokenInvalidatedAt: null,
          status: 'PENDING',
        },
      });

      // 4. Transition offer to SENT — compare-and-swap: only succeeds if still DRAFT.
      // If two concurrent send() calls race, exactly one transaction wins here;
      // the other sees count=0 and rolls back cleanly (idempotency guard).
      const { count } = await tx.offer.updateMany({
        where: { id: offer.id, status: 'DRAFT' },
        data: { status: 'SENT' },
      });
      if (count === 0) throw new OfferNotEditableError('SENT');

      return snap;
    });

    // ── Increment plan usage counter ──────────────────────────────────────────
    // Called after the transaction commits so aborted concurrent sends don't
    // inflate the count. Best-effort: a failure here does not reverse the send.
    await this.subscriptionService.incrementOfferCount(orgId).catch((e: unknown) =>
      this.logger.error(`Failed to increment offer count for org ${orgId}: ${e}`),
    );

    // ── Record delivery attempt and send email ────────────────────────────────
    const webBaseUrl = this.config.getOrThrow<string>('WEB_BASE_URL');
    const signingUrl = `${webBaseUrl}/accept/${rawToken}`;

    // Create attempt record before the call so we have an ID to update.
    // tokenHash here matches what was set on OfferRecipient above.
    const attempt = await this.db.offerDeliveryAttempt.create({
      data: {
        offerId: offer.id,
        recipientEmail: recipient.email,
        tokenHash,
        outcome: 'DISPATCHING',
        attemptedBy: null, // system-initiated
      },
    });

    try {
      await this.emailPort.sendOfferLink({
        to: recipient.email,
        recipientName: recipient.name,
        offerTitle: offer.title,
        senderName,
        signingUrl,
        expiresAt: offer.expiresAt,
      });

      await this.db.offerDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { outcome: 'DELIVERED_TO_PROVIDER' },
      });

      // Create reminder schedule — first reminder fires 24 h from now.
      // Created after the email succeeds so we only schedule reminders for
      // deals that were actually delivered. Best-effort: failure here does
      // not affect the send result.
      await this.db.reminderSchedule.create({
        data: {
          offerId: offer.id,
          dealSentAt: snapshot.frozenAt,
          nextReminderAt: new Date(snapshot.frozenAt.getTime() + 24 * 60 * 60 * 1000),
          reminderCount: 0,
        },
      }).catch((e: unknown) =>
        this.logger.warn(`Failed to create reminder schedule for offer ${offer.id}: ${e}`),
      );

      void this.dealEventService.emit(offer.id, 'deal_sent', { deliveryAttemptId: attempt.id });
      this.metrics.recordDealSent();
      return {
        snapshotId: snapshot.id,
        sentAt: snapshot.frozenAt,
        deliveryAttemptId: attempt.id,
        deliveryOutcome: 'DELIVERED_TO_PROVIDER',
      };
    } catch (err: unknown) {
      const { failureCode, failureReason } = extractFailureInfo(err);

      await this.db.offerDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { outcome: 'FAILED', failureCode, failureReason },
      });

      this.logger.error(
        `Offer link delivery failed for offer ${offer.id} to ${recipient.email}: ${failureReason}`,
      );

      // Still create a reminder schedule even when delivery failed — the
      // resend flow will regenerate a fresh token, and reminders may still
      // reach the recipient if the delivery issue is transient.
      await this.db.reminderSchedule.create({
        data: {
          offerId: offer.id,
          dealSentAt: snapshot.frozenAt,
          nextReminderAt: new Date(snapshot.frozenAt.getTime() + 24 * 60 * 60 * 1000),
          reminderCount: 0,
        },
      }).catch((e: unknown) =>
        this.logger.warn(`Failed to create reminder schedule for offer ${offer.id}: ${e}`),
      );

      return {
        snapshotId: snapshot.id,
        sentAt: snapshot.frozenAt,
        deliveryAttemptId: attempt.id,
        deliveryOutcome: 'FAILED',
      };
    }
  }

  // ─── Resend ─────────────────────────────────────────────────────────────────
  // Generates a new signing token and re-sends the offer link to the recipient.
  //
  // Domain rules:
  //   - Offer must be SENT (not DRAFT, ACCEPTED, DECLINED, EXPIRED, or REVOKED)
  //   - Recipient token must not be permanently invalidated (i.e., not revoked)
  //
  // A new token is generated to ensure the new link is distinct from any prior
  // link. The old token (if the recipient has it) will no longer start a new
  // session after the token is replaced — existing active sessions are unaffected.
  //
  // Email content is sourced from the immutable OfferSnapshot, not the mutable
  // Offer record, to guarantee delivery content matches what was frozen at send time.
  //
  // A new OfferDeliveryAttempt is created regardless of outcome (audit trail).

  async resend(
    offerId: string,
    orgId: string,
    userId: string,
  ): Promise<ResendResult> {
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, organizationId: orgId, deletedAt: null },
      include: { recipient: true },
    });

    if (!offer) throw new NotFoundException('Offer not found.');
    if (offer.status !== 'SENT') {
      throw new OfferNotResendableError(`offer status is '${offer.status}'`);
    }

    const recipient = offer.recipient!;
    // tokenInvalidatedAt is set by revoke — once revoked, the token cannot be resent.
    if (recipient.tokenInvalidatedAt !== null) {
      throw new OfferNotResendableError('recipient token has been permanently invalidated (offer was revoked)');
    }

    // ── Generate new token (same expiry rules as original send) ───────────────
    const tokenExpiryDays = this.config.get<number>('TOKEN_EXPIRY_DAYS', 30);
    const tokenExpiry = offer.expiresAt ?? new Date(Date.now() + tokenExpiryDays * 24 * 60 * 60 * 1000);
    const { rawToken, tokenHash, tokenExpiresAt } = generateRecipientToken(tokenExpiry);

    // Replace token atomically — old link will no longer initiate new sessions.
    await this.db.offerRecipient.update({
      where: { offerId: offer.id },
      data: { tokenHash, tokenExpiresAt, tokenInvalidatedAt: null },
    });

    // ── Load snapshot for frozen content ──────────────────────────────────────
    // Must use the snapshot (not the mutable offer) so email content matches
    // what was shown to the recipient at signing time.
    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { offerId: offer.id },
      select: { title: true, senderName: true, expiresAt: true },
    });

    // ── Record attempt and send email ─────────────────────────────────────────
    const webBaseUrl = this.config.getOrThrow<string>('WEB_BASE_URL');
    const signingUrl = `${webBaseUrl}/accept/${rawToken}`;

    const attempt = await this.db.offerDeliveryAttempt.create({
      data: {
        offerId: offer.id,
        recipientEmail: recipient.email,
        tokenHash,
        outcome: 'DISPATCHING',
        attemptedBy: userId,
      },
    });

    try {
      await this.emailPort.sendOfferLink({
        to: recipient.email,
        recipientName: recipient.name,
        offerTitle: snapshot.title,
        senderName: snapshot.senderName,
        signingUrl,
        expiresAt: snapshot.expiresAt,
      });

      await this.db.offerDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { outcome: 'DELIVERED_TO_PROVIDER' },
      });

      return { deliveryAttemptId: attempt.id, deliveryOutcome: 'DELIVERED_TO_PROVIDER' };
    } catch (err: unknown) {
      const { failureCode, failureReason } = extractFailureInfo(err);

      await this.db.offerDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { outcome: 'FAILED', failureCode, failureReason },
      });

      this.logger.error(
        `Resend delivery failed for offer ${offerId} to ${recipient.email}: ${failureReason}`,
      );

      return { deliveryAttemptId: attempt.id, deliveryOutcome: 'FAILED' };
    }
  }

  // ─── Delivery history ────────────────────────────────────────────────────────
  // Returns all delivery attempts for an offer, newest first.
  // Used by the GET /offers/:id/delivery endpoint.

  async getDeliveryHistory(
    offerId: string,
    orgId: string,
  ): Promise<{ attempts: DeliveryAttemptRecord[]; latestOutcome: string | null }> {
    // Verify org scope — only return history for offers belonging to this org.
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, organizationId: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!offer) throw new NotFoundException('Offer not found.');

    const rows = await this.db.offerDeliveryAttempt.findMany({
      where: { offerId },
      orderBy: { attemptedAt: 'desc' },
      select: {
        id: true,
        outcome: true,
        recipientEmail: true,
        failureCode: true,
        failureReason: true,
        attemptedBy: true,
        attemptedAt: true,
      },
    });

    return {
      attempts: rows,
      latestOutcome: rows.length > 0 ? rows[0].outcome : null,
    };
  }

  // ─── Revoke ──────────────────────────────────────────────────────────────────

  async revoke(offerId: string, orgId: string): Promise<void> {
    const offer = await this.db.offer.findFirst({
      where: { id: offerId, organizationId: orgId, deletedAt: null },
    });

    if (!offer) throw new NotFoundException('Offer not found.');

    // Only SENT offers can be revoked. Terminal states and DRAFT are not revocable.
    if (offer.status !== 'SENT') {
      throw new OfferNotRevocableError(offer.status);
    }

    await this.db.$transaction(async (tx) => {
      // Invalidate the recipient token so the signing link no longer works
      await tx.offerRecipient.update({
        where: { offerId: offer.id },
        data: { tokenInvalidatedAt: new Date() },
      });

      // Transition offer to REVOKED
      await tx.offer.update({
        where: { id: offer.id },
        data: { status: 'REVOKED' },
      });
    });

    // Cancel reminder schedule — best-effort, non-blocking.
    await this.db.reminderSchedule.deleteMany({ where: { offerId: offer.id } }).catch((e: unknown) =>
      this.logger.warn(`Failed to delete reminder schedule on revoke for offer ${offer.id}: ${e}`),
    );

    void this.dealEventService.emit(offer.id, 'deal_revoked');
  }
}
