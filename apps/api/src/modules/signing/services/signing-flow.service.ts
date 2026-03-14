import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SigningTokenService } from './signing-token.service';
import { SigningSessionService, SessionContext } from './signing-session.service';
import { SigningOtpService, IssuedOtpResult, VerifyOtpResult } from './signing-otp.service';
import { AcceptanceService, AcceptanceContext, AcceptanceResult } from './acceptance.service';
import { SigningEventService } from './signing-event.service';
import { CertificateService } from '../../certificates/certificate.service';
import { EMAIL_PORT, EmailPort } from '../../../common/email/email.port';
import {
  InvalidStateTransitionError,
  OfferExpiredError,
  SessionExpiredError,
  TokenInvalidError,
} from '../../../common/errors/domain.errors';
import { buildAcceptanceStatement } from '../domain/acceptance-statement';

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
//   1. getOfferContext(token)           → validate token, return snapshot; NO OTP sent
//   2. requestOtp(token, ctx)           → recipient explicitly asks; session created here
//   3. verifyOtp(token, challengeId, code, ctx) → verify code
//   4. accept(token, challengeId, ctx)  → final acceptance
//   5. decline(token, ctx)              → decline
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
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
  ) {}

  // Step 1: Validate token and return the frozen offer context.
  // Does NOT create a session. Does NOT send an OTP.
  // Safe to call from GET — idempotent.
  async getOfferContext(rawToken: string): Promise<OfferContext> {
    const recipient = await this.tokenService.verifyToken(rawToken);

    const offer = await this.db.offer.findUniqueOrThrow({ where: { id: recipient.offerId } });

    if (offer.status !== 'SENT') {
      // Expired, accepted, declined, or revoked — same error to avoid state leakage
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

  // Step 3: Verify OTP; advance session to OTP_VERIFIED.
  async verifyOtp(
    rawToken: string,
    challengeId: string,
    rawCode: string,
    ctx: SessionContext,
  ): Promise<VerifyOtpResult> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const session = await this.getRequiredSession(recipient.id);

    const result = await this.otpService.verify(challengeId, session.id, rawCode, ctx);

    // Advance session status directly (OTP_VERIFIED event already written by otpService)
    if (session.status === 'AWAITING_OTP') {
      await this.db.signingSession.update({
        where: { id: session.id },
        data: { status: 'OTP_VERIFIED', otpVerifiedAt: result.verifiedAt },
      });
      await this.db.offerRecipient.update({
        where: { id: recipient.id },
        data: { status: 'OTP_VERIFIED' },
      });
    }

    return result;
  }

  // Step 4a: Accept offer (requires OTP_VERIFIED session).
  // Certificate is generated synchronously after the acceptance transaction commits.
  // Notification emails are sent best-effort — failure never reverses the acceptance.
  async accept(
    rawToken: string,
    challengeId: string,
    context: AcceptanceContext,
  ): Promise<AcceptanceResult> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const session = await this.getRequiredSession(recipient.id);
    const result = await this.acceptanceService.accept(session, challengeId, context);

    const { certificateId } = await this.certificateService.generateForAcceptance(
      result.acceptanceRecord.id,
    );

    // Send acceptance notifications — best-effort. AcceptanceResult already has
    // all needed data (snapshot + recipient were loaded in acceptanceService.accept).
    try {
      await this.emailPort.sendAcceptanceConfirmationToSender({
        to: result.senderEmail,
        senderName: result.senderName,
        offerTitle: result.offerTitle,
        recipientName: result.recipientName,
        recipientEmail: result.recipientEmail,
        acceptedAt: result.acceptanceRecord.acceptedAt,
        certificateId: certificateId!,
      });
      await this.emailPort.sendAcceptanceConfirmationToRecipient({
        to: result.recipientEmail,
        recipientName: result.recipientName,
        offerTitle: result.offerTitle,
        senderName: result.senderName,
        acceptedAt: result.acceptanceRecord.acceptedAt,
        certificateId: certificateId!,
      });
    } catch (err) {
      this.logger.error('Failed to send acceptance notification emails', err);
    }

    return { ...result, certificateId };
  }

  // Step 4b: Decline offer.
  // Decline notification to the sender is sent best-effort after the decline commits.
  async decline(rawToken: string, ctx: SessionContext): Promise<void> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const session = await this.getRequiredSession(recipient.id);
    await this.acceptanceService.decline(session, ctx);

    // Load snapshot for sender contact details — best-effort only.
    try {
      const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
        where: { id: session.snapshotId },
      });
      await this.emailPort.sendDeclineNotification({
        to: snapshot.senderEmail,
        senderName: snapshot.senderName,
        offerTitle: snapshot.title,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        declinedAt: new Date(),
      });
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

  private async getRequiredSession(recipientId: string) {
    const session = await this.sessionService.findResumable(recipientId);
    if (!session) throw new SessionExpiredError();
    return session;
  }
}
