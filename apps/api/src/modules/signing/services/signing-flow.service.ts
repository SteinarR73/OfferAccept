import { Injectable, Inject, Logger } from '@nestjs/common';
// Note: EMAIL_PORT is no longer injected here — acceptance notification emails are
// dispatched via the notify-deal-accepted pg-boss job (durable, retryable).
// Decline notification emails are still sent via NotificationsService (synchronous, best-effort).
import { PrismaClient, SigningSession } from '@prisma/client';
import { SigningTokenService } from './signing-token.service';
import { SigningSessionService, SessionContext } from './signing-session.service';
import { SigningOtpService, IssuedOtpResult, VerifyOtpResult } from './signing-otp.service';
import { AcceptanceService, AcceptanceContext, AcceptanceResult } from './acceptance.service';
import { SigningEventService } from './signing-event.service';
import { CertificateService } from '../../certificates/certificate.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DealDeclinedEvent } from '../../notifications/events/deal-declined.event';
import {
  InvalidStateTransitionError,
  OfferAlreadyAcceptedError,
  OfferExpiredError,
  OtpChallengeMismatchError,
  SessionExpiredError,
  TokenInvalidError,
} from '../../../common/errors/domain.errors';
import { buildAcceptanceStatement } from '../domain/acceptance-statement';
import { WebhookService } from '../../enterprise/webhook.service';
import { DealEventService } from '../../deal-events/deal-events.service';
import { JobService } from '../../jobs/job.service';
import { TraceContext } from '../../../common/trace/trace.context';

// ─── Response types ────────────────────────────────────────────────────────────

export interface OfferContext {
  sessionId: string;           // for client correlation only — not used in API calls
  offerTitle: string;
  offerMessage: string | null;
  senderName: string;
  recipientName: string;
  expiresAt: string | null;
  documents: Array<{
    documentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  // Server-computed acceptance statement text.
  // Returned here so the UI can display it before the user initiates OTP.
  // The server recomputes it independently on actual acceptance.
  acceptanceStatement: string;
}

// ─── SigningFlowService ────────────────────────────────────────────────────────
// Orchestrates the public signing flow. The only class controllers should call.
//
// Step sequence (enforced by state machines, not by this service):
//   1. getOfferContext(token)                    → validate token, return snapshot; NO OTP sent
//   2. requestOtp(token, ctx)                    → recipient explicitly asks; session created here
//   3. verifyOtp(token, challengeId, code, ctx)  → verify code; atomically advances all state
//   4. accept(token, challengeId, ctx)           → final acceptance
//   5. decline(token, ctx)                       → decline
//
// Session/challenge binding:
//   verifyOtp:  The authoritative session is derived from the challenge's bound sessionId.
//               No "latest resumable" lookup. If the challenge belongs to a different or
//               expired session, verification fails with a deterministic domain error.
//
//   accept:     The authoritative session is derived from the VERIFIED challenge's bound
//               sessionId. Prevents a scenario where a second session is "latest resumable"
//               but the verified challenge belongs to the first session.
//
//   decline:    Uses findResumable() — acceptable because decline does not create
//               verifiable evidence and does not require challenge binding.
//
// Why OTP is NOT sent on link open:
//   Email security scanners follow links to check for phishing. If opening the URL
//   triggers an OTP email, the scanner consumes the OTP before the recipient sees it.
//   OTP issuance is gated on explicit recipient intent (POST, not GET).

@Injectable()
export class SigningFlowService {
  private readonly logger = new Logger(SigningFlowService.name);

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly tokenService: SigningTokenService,
    private readonly sessionService: SigningSessionService,
    private readonly otpService: SigningOtpService,
    private readonly acceptanceService: AcceptanceService,
    private readonly eventService: SigningEventService,
    private readonly certificateService: CertificateService,
    private readonly notificationsService: NotificationsService,
    private readonly webhookService: WebhookService,
    private readonly dealEventService: DealEventService,
    private readonly jobService: JobService,
    private readonly traceContext: TraceContext,
  ) {}

  // Step 1: Validate token and return the frozen offer context.
  // Does NOT create a session. Does NOT send an OTP.
  // Safe to call from GET — idempotent.
  async getOfferContext(rawToken: string): Promise<OfferContext> {
    const recipient = await this.tokenService.verifyToken(rawToken);

    const offer = await this.db.offer.findUniqueOrThrow({ where: { id: recipient.offerId } });

    if (offer.status === 'ACCEPTED') {
      // Surface acceptance details so the recipient can see their acceptance confirmation.
      const cert = await this.db.acceptanceCertificate.findFirst({
        where: { offerId: offer.id },
        select: { id: true, acceptanceRecord: { select: { acceptedAt: true } } },
      });
      throw new OfferAlreadyAcceptedError(
        cert?.acceptanceRecord?.acceptedAt,
        cert?.id,
      );
    }

    if (offer.status !== 'SENT') {
      // Declined, revoked, expired — intentionally opaque to avoid state leakage
      throw new TokenInvalidError();
    }

    if (offer.expiresAt && offer.expiresAt <= new Date()) {
      throw new OfferExpiredError();
    }

    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { offerId: recipient.offerId },
      include: { documents: true },
    });

    // Find existing resumable session to return a consistent sessionId to the client
    const existingSession = await this.sessionService.findResumable(recipient.id);

    return {
      sessionId: existingSession?.id ?? '',  // empty string = no session yet
      offerTitle: snapshot.title,
      offerMessage: snapshot.message,
      senderName: snapshot.senderName,
      recipientName: recipient.name,
      expiresAt: snapshot.expiresAt?.toISOString() ?? null,
      documents: snapshot.documents.map((d) => ({
        documentId: d.id,
        filename: d.filename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
      })),
      acceptanceStatement: buildAcceptanceStatement({
        recipientName: recipient.name,
        offerTitle: snapshot.title,
        senderName: snapshot.senderName,
        senderEmail: snapshot.senderEmail,
      }),
    };
  }

  // Step 2: Create or resume session; issue OTP.
  // This is the first POST action — called by explicit user intent.
  async requestOtp(rawToken: string, ctx: SessionContext): Promise<IssuedOtpResult> {
    const recipient = await this.tokenService.verifyToken(rawToken);

    const offer = await this.db.offer.findUniqueOrThrow({ where: { id: recipient.offerId } });
    if (offer.status !== 'SENT') throw new TokenInvalidError();
    if (offer.expiresAt && offer.expiresAt <= new Date()) throw new OfferExpiredError();

    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { offerId: offer.id },
    });

    // Mark recipient as VIEWED on first OTP request (first real intent signal)
    if (recipient.status === 'PENDING') {
      await this.db.offerRecipient.update({
        where: { id: recipient.id },
        data: { status: 'VIEWED', viewedAt: new Date() },
      });
      void this.dealEventService.emit(offer.id, 'deal_opened');
    }

    // Resume existing non-expired session or create a fresh one
    let session = await this.sessionService.findResumable(recipient.id);
    if (!session) {
      session = await this.sessionService.create(recipient.id, offer.id, snapshot.id, ctx);
    }

    const { result } = await this.otpService.issue(
      session.id,
      recipient.id,
      recipient.email,
      recipient.name,
      snapshot.title,
      ctx,
    );

    return result;
  }

  // Step 3: Verify OTP; atomically advance challenge + session + recipient to OTP_VERIFIED.
  //
  // The session is derived from the challenge's bound sessionId — not from "latest resumable".
  // If the challenge does not exist, belongs to a different recipient, or its session is
  // expired/wrong state, a deterministic domain error is thrown with no partial state.
  //
  // All state changes (challenge VERIFIED, session OTP_VERIFIED, recipient OTP_VERIFIED,
  // OTP_VERIFIED event) happen in a single $transaction inside SigningOtpService.
  async verifyOtp(
    rawToken: string,
    challengeId: string,
    rawCode: string,
    ctx: SessionContext,
  ): Promise<VerifyOtpResult> {
    const recipient = await this.tokenService.verifyToken(rawToken);

    // Atomic: validates challenge binding, verifies code, advances all state in one tx.
    const result = await this.otpService.verifyAndAdvanceSession(challengeId, recipient.id, rawCode, ctx);
    void this.dealEventService.emit(recipient.offerId, 'otp_verified');
    return result;
  }

  // Step 4a: Accept offer (requires OTP_VERIFIED session).
  //
  // The authoritative session is derived from the verified challenge's bound sessionId.
  // This prevents the "wrong session" scenario where multiple sessions exist for a
  // recipient and findResumable() would return the latest (possibly wrong) one.
  //
  // Certificate is generated synchronously after the acceptance transaction commits.
  // Notification emails are sent best-effort — failure never reverses the acceptance.
  async accept(
    rawToken: string,
    challengeId: string,
    context: AcceptanceContext,
  ): Promise<AcceptanceResult> {
    const recipient = await this.tokenService.verifyToken(rawToken);

    // Derive session from the VERIFIED challenge's bound sessionId.
    // Throws OtpChallengeMismatchError if challenge is not VERIFIED or wrong recipient.
    // Throws SessionExpiredError if session is expired or in a terminal/wrong state.
    const session = await this.getSessionFromVerifiedChallenge(challengeId, recipient.id);

    const result = await this.acceptanceService.accept(session, challengeId, context);
    void this.dealEventService.emit(result.offerId, 'deal_accepted');

    const { certificateId, certificateHash } = await this.certificateService.generateForAcceptance(
      result.acceptanceRecord.id,
    );

    const appBaseUrl = process.env['APP_URL'] ?? 'https://app.offeraccept.com';
    const verifyUrl = certificateId
      ? `${appBaseUrl}/verify/${encodeURIComponent(certificateId)}`
      : '';

    const traceId = this.traceContext.get();

    // Enqueue durable notification job — acceptance confirmation emails for both parties.
    // Business state is already committed; pg-boss persists the job and retries on failure.
    // Wrapped in .catch() so a transient enqueue error does not block the acceptance response.
    const notifyJobId = await this.jobService.send(
      'notify-deal-accepted',
      {
        acceptanceRecordId: result.acceptanceRecord.id,
        offerId: result.offerId,
        offerTitle: result.offerTitle,
        senderEmail: result.senderEmail,
        senderName: result.senderName,
        recipientEmail: result.recipientEmail,
        recipientName: result.recipientName,
        acceptedAt: result.acceptanceRecord.acceptedAt.toISOString(),
        certificateId: certificateId ?? '',
        certificateHash: certificateHash ?? '',
        verifyUrl,
        traceId,
      },
      { singletonKey: `notify-deal-accepted:${result.acceptanceRecord.id}` },
    ).catch((e: unknown) => {
      this.logger.error(JSON.stringify({
        metric: 'notify_deal_accepted_enqueue_failed',
        traceId,
        offerId: result.offerId,
        acceptanceRecordId: result.acceptanceRecord.id,
        error: e instanceof Error ? e.message : String(e),
      }));
      return null;
    });
    this.logger.log(JSON.stringify({
      metric: 'notify_deal_accepted_enqueued',
      traceId,
      offerId: result.offerId,
      acceptanceRecordId: result.acceptanceRecord.id,
      jobId: notifyJobId,
    }));

    // Dispatch outgoing webhooks — best-effort, enqueued via pg-boss.
    // Failures here do not reverse the acceptance or block the response.
    try {
      // deal.accepted: emitted immediately after acceptance is committed.
      await this.webhookService.dispatchEvent(
        result.organizationId,
        'deal_accepted',
        {
          offerId: result.offerId,
          organizationId: result.organizationId,
          recipientEmail: result.recipientEmail,
          acceptedAt: result.acceptanceRecord.acceptedAt.toISOString(),
          certificateId: certificateId ?? null,
        },
        traceId,
      );

      // certificate.issued: emitted after the certificate is generated.
      // certificateId is null only if generateForAcceptance() failed (rare).
      if (certificateId) {
        await this.webhookService.dispatchEvent(
          result.organizationId,
          'certificate_issued',
          {
            offerId: result.offerId,
            organizationId: result.organizationId,
            certificateId,
            issuedAt: new Date().toISOString(),
          },
          traceId,
        );
      }
    } catch (err) {
      this.logger.error('Failed to dispatch webhook events after acceptance', err);
    }

    return { ...result, certificateId };
  }

  // Step 4b: Decline offer.
  // Decline notification to the sender is sent best-effort after the decline commits.
  //
  // Session resolution (in priority order):
  //   1. challengeId provided → getSessionFromChallenge() — preferred; eliminates
  //      multi-tab ambiguity by resolving the exact session the OTP was issued for.
  //   2. challengeId absent → findResumable() — fallback; used when the recipient
  //      declines before requesting an OTP (so no challengeId exists yet).
  //
  // The challenge does NOT need to be VERIFIED to decline — the recipient may
  // want to decline before completing OTP verification.
  async decline(rawToken: string, challengeId: string | undefined, ctx: SessionContext): Promise<void> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const session = challengeId
      ? await this.getSessionFromChallenge(challengeId, recipient.id)
      : await this.sessionService.findResumable(recipient.id);
    if (!session) throw new SessionExpiredError();
    await this.acceptanceService.decline(session, ctx);
    void this.dealEventService.emit(session.offerId, 'deal_declined');

    // Cancel reminder schedule — best-effort.
    await this.db.reminderSchedule.deleteMany({ where: { offerId: session.offerId } }).catch((e: unknown) =>
      this.logger.warn(`Failed to delete reminder schedule on decline for offer ${session.offerId}: ${e}`),
    );

    // Send decline notification — best-effort (errors are caught inside NotificationsService).
    // Load snapshot for sender contact details.
    try {
      const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
        where: { id: session.snapshotId },
      });
      await this.notificationsService.onDealDeclined(new DealDeclinedEvent(
        session.offerId,
        snapshot.title,
        snapshot.senderEmail,
        snapshot.senderName,
        recipient.email,
        recipient.name,
        new Date(),
      ));
    } catch (err) {
      this.logger.error('Failed to send decline notification email', err);
    }
  }

  // Internal support action: issue a fresh OTP to an active signing session.
  //
  // This path does NOT require the raw signing token — it is for internal staff
  // who have located the session by offerId/recipientEmail via support tooling.
  //
  // Domain rules enforced:
  //   - Session must exist and be in AWAITING_OTP status
  //   - Session must not be expired (TTL check)
  //   - Completed and terminal sessions (ACCEPTED, DECLINED, EXPIRED, ABANDONED)
  //     cannot receive new OTPs — those sessions are part of immutable evidence
  //
  // Note: does NOT advance offer or recipient status. Only creates a new OTP
  // challenge and sends it. The signing event chain records the OTP_ISSUED event.
  async issueOtpForSession(
    sessionId: string,
    ctx: SessionContext,
  ): Promise<IssuedOtpResult> {
    const session = await this.db.signingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionExpiredError();
    }

    // Support can only re-issue OTP for sessions that are actively awaiting one.
    // OTP_VERIFIED and terminal sessions must not be disturbed.
    if (session.status !== 'AWAITING_OTP') {
      throw new InvalidStateTransitionError(
        session.status,
        'OTP_ISSUED',
        'SigningSession',
      );
    }

    if (session.expiresAt <= new Date()) {
      throw new SessionExpiredError();
    }

    const recipient = await this.db.offerRecipient.findUniqueOrThrow({
      where: { id: session.recipientId },
    });

    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { id: session.snapshotId },
      select: { title: true },
    });

    const { result } = await this.otpService.issue(
      session.id,
      recipient.id,
      recipient.email,
      recipient.name,
      snapshot.title,
      ctx,
    );

    return result;
  }

  // Records a document view audit event.
  async recordDocumentView(
    rawToken: string,
    documentId: string,
    ctx: SessionContext,
  ): Promise<void> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const existingSession = await this.sessionService.findResumable(recipient.id);
    if (!existingSession) return; // no session yet — safe to ignore

    const doc = await this.db.offerSnapshotDocument.findFirst({
      where: { snapshotId: existingSession.snapshotId, id: documentId },
    });
    if (!doc) return;

    await this.eventService.append({
      sessionId: existingSession.id,
      eventType: 'DOCUMENT_VIEWED',
      payload: { documentId: doc.id, filename: doc.filename },
      ...ctx,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────────

  // Derives the authoritative session from a VERIFIED OTP challenge.
  //
  // Used by accept() to ensure the session being accepted is the same one
  // in which the OTP was verified — not an ambiguous "latest resumable" session.
  //
  // Throws OtpChallengeMismatchError if:
  //   - challenge does not exist
  //   - challenge.recipientId !== recipientId (binding violation)
  //   - challenge.status !== 'VERIFIED' (OTP not yet verified in this challenge)
  //
  // Throws SessionExpiredError if the bound session is expired or in a wrong state.
  private async getSessionFromVerifiedChallenge(
    challengeId: string,
    recipientId: string,
  ): Promise<SigningSession> {
    const challenge = await this.db.signingOtpChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge || challenge.recipientId !== recipientId || challenge.status !== 'VERIFIED') {
      throw new OtpChallengeMismatchError();
    }

    // getAndValidate enforces TTL and non-terminal status.
    // If the session is expired or in ACCEPTED/DECLINED/EXPIRED/ABANDONED, it throws.
    return this.sessionService.getAndValidate(challenge.sessionId);
  }

  // Derives the authoritative session from any challenge (any status) that belongs
  // to the given recipient. Used by decline() — which does not require OTP completion.
  //
  // Throws OtpChallengeMismatchError if:
  //   - challenge does not exist
  //   - challenge.recipientId !== recipientId (binding violation)
  //
  // Throws SessionExpiredError if the bound session is expired or in a terminal state.
  private async getSessionFromChallenge(
    challengeId: string,
    recipientId: string,
  ): Promise<SigningSession> {
    const challenge = await this.db.signingOtpChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge || challenge.recipientId !== recipientId) {
      throw new OtpChallengeMismatchError();
    }

    return this.sessionService.getAndValidate(challenge.sessionId);
  }
}
