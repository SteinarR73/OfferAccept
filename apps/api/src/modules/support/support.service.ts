import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SendOfferService } from '../offers/services/send-offer.service';
import { SigningFlowService } from '../signing/services/signing-flow.service';
import { CertificateService } from '../certificates/certificate.service';
import { SessionContext } from '../signing/services/signing-session.service';
import { IssuedOtpResult } from '../signing/services/signing-otp.service';

// ─── Timeline types ────────────────────────────────────────────────────────────

export type TimelineActor = 'system' | 'sender' | 'recipient' | 'support';

export interface TimelineEntry {
  timestamp: string;       // ISO 8601
  event: string;           // Human-readable label for a reviewer
  actor: TimelineActor;
  detail: string | null;   // Supporting context (email addresses, attempt counts, etc.)
}

// ─── Case view types ───────────────────────────────────────────────────────────

export interface SupportCaseView {
  offer: {
    id: string;
    title: string;
    status: string;
    expiresAt: string | null;
    createdAt: string;
  };
  snapshot: {
    id: string;
    title: string;
    senderName: string;
    senderEmail: string;
    frozenAt: string;
    contentHash: string;
    documentCount: number;
  } | null;
  recipient: {
    id: string;
    email: string;
    name: string;
    status: string;
    viewedAt: string | null;
    respondedAt: string | null;
    tokenExpiresAt: string;
    tokenInvalidatedAt: string | null;
  } | null;
  deliveryAttempts: Array<{
    id: string;
    outcome: string;
    recipientEmail: string;
    failureCode: number | null;
    failureReason: string | null;
    attemptedBy: string | null;
    attemptedAt: string;
  }>;
  sessions: Array<{
    id: string;
    status: string;
    startedAt: string;
    expiresAt: string;
    completedAt: string | null;
    ipAddress: string | null;
    eventCount: number;
  }>;
  acceptanceRecord: {
    id: string;
    acceptedAt: string;
    verifiedEmail: string;
    acceptanceStatement: string;
    ipAddress: string | null;
    locale: string | null;
    timezone: string | null;
  } | null;
  certificate: {
    id: string;
    issuedAt: string;
    verification: {
      valid: boolean;
      certificateHashMatch: boolean;
      reconstructedHash: string;
      storedHash: string;
      snapshotIntegrity: boolean;
      eventChainValid: boolean;
      brokenAtSequence?: number;
      anomaliesDetected: string[];
    };
  } | null;
}

// ─── SupportService ────────────────────────────────────────────────────────────
// Read-only inspection and limited safe actions for internal support staff.
//
// INVARIANTS this service must never break:
//   - SigningEvent rows are NEVER written or mutated here
//   - AcceptanceRecord rows are NEVER written or mutated here
//   - OfferSnapshot rows are NEVER written or mutated here
//   - AcceptanceCertificate rows are NEVER written or mutated here
//
// Safe actions:
//   - revokeOffer: delegates to SendOfferService.revoke() — only SENT offers
//   - resendOfferLink: delegates to SendOfferService.resend() — only SENT offers
//   - resendSessionOtp: delegates to SigningFlowService.issueOtpForSession()
//                       — only AWAITING_OTP sessions, session-gated OTP issuance

@Injectable()
export class SupportService {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly sendOfferService: SendOfferService,
    private readonly signingFlowService: SigningFlowService,
    private readonly certificateService: CertificateService,
  ) {}

  // ── Search ────────────────────────────────────────────────────────────────────
  // Find offers by ID or recipient email. Cross-org: no orgId filter.
  // Returns a lightweight summary — full details are in getCase().

  async searchOffers(query: {
    offerId?: string;
    recipientEmail?: string;
  }): Promise<Array<{
    offerId: string;
    offerTitle: string;
    status: string;
    recipientEmail: string | null;
    createdAt: string;
  }>> {
    if (!query.offerId && !query.recipientEmail) {
      return [];
    }

    if (query.offerId) {
      // Direct lookup by offer ID
      const offer = await this.db.offer.findUnique({
        where: { id: query.offerId },
        include: { recipient: { select: { email: true } } },
      });
      if (!offer || offer.deletedAt) return [];
      return [{
        offerId: offer.id,
        offerTitle: offer.title,
        status: offer.status,
        recipientEmail: offer.recipient?.email ?? null,
        createdAt: offer.createdAt.toISOString(),
      }];
    }

    // Recipient email lookup — may match multiple offers (one per offer, v1)
    const recipients = await this.db.offerRecipient.findMany({
      where: { email: query.recipientEmail },
      include: {
        offer: { select: { id: true, title: true, status: true, createdAt: true, deletedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return recipients
      .filter((r) => !r.offer.deletedAt)
      .map((r) => ({
        offerId: r.offer.id,
        offerTitle: r.offer.title,
        status: r.offer.status,
        recipientEmail: r.email,
        createdAt: r.offer.createdAt.toISOString(),
      }));
  }

  // ── Full case view ────────────────────────────────────────────────────────────
  // Loads all evidence for an offer: snapshot, recipient, delivery, sessions,
  // acceptance, and certificate verification. This is the primary investigation
  // tool — intended to be readable by a non-technical reviewer.

  async getCase(offerId: string): Promise<SupportCaseView> {
    const offer = await this.db.offer.findUnique({
      where: { id: offerId },
    });
    if (!offer) throw new NotFoundException('Offer not found.');

    // ── Snapshot ──────────────────────────────────────────────────────────────
    const snapshot = await this.db.offerSnapshot.findUnique({
      where: { offerId },
      include: { _count: { select: { documents: true } } },
    });

    // ── Recipient ──────────────────────────────────────────────────────────────
    const recipient = await this.db.offerRecipient.findUnique({
      where: { offerId },
    });

    // ── Delivery attempts ─────────────────────────────────────────────────────
    const deliveryAttempts = await this.db.offerDeliveryAttempt.findMany({
      where: { offerId },
      orderBy: { attemptedAt: 'desc' },
    });

    // ── Sessions with event counts ────────────────────────────────────────────
    const sessions = await this.db.signingSession.findMany({
      where: { offerId },
      orderBy: { startedAt: 'asc' },
      include: { _count: { select: { events: true } } },
    });

    // ── Acceptance record ─────────────────────────────────────────────────────
    const acceptanceRecord = await this.db.acceptanceRecord.findFirst({
      where: { snapshotId: snapshot?.id },
    });

    // ── Certificate ───────────────────────────────────────────────────────────
    let certificate: SupportCaseView['certificate'] = null;
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { offerId },
    });
    if (cert) {
      const verification = await this.certificateService.verify(cert.id);
      certificate = {
        id: cert.id,
        issuedAt: cert.issuedAt.toISOString(),
        verification: {
          valid: verification.valid,
          certificateHashMatch: verification.certificateHashMatch,
          reconstructedHash: verification.reconstructedHash,
          storedHash: verification.storedHash,
          snapshotIntegrity: verification.snapshotIntegrity,
          eventChainValid: verification.eventChainValid,
          brokenAtSequence: verification.brokenAtSequence,
          anomaliesDetected: verification.anomaliesDetected,
        },
      };
    }

    return {
      offer: {
        id: offer.id,
        title: offer.title,
        status: offer.status,
        expiresAt: offer.expiresAt?.toISOString() ?? null,
        createdAt: offer.createdAt.toISOString(),
      },
      snapshot: snapshot
        ? {
            id: snapshot.id,
            title: snapshot.title,
            senderName: snapshot.senderName,
            senderEmail: snapshot.senderEmail,
            frozenAt: snapshot.frozenAt.toISOString(),
            contentHash: snapshot.contentHash,
            documentCount: snapshot._count.documents,
          }
        : null,
      recipient: recipient
        ? {
            id: recipient.id,
            email: recipient.email,
            name: recipient.name,
            status: recipient.status,
            viewedAt: recipient.viewedAt?.toISOString() ?? null,
            respondedAt: recipient.respondedAt?.toISOString() ?? null,
            tokenExpiresAt: recipient.tokenExpiresAt.toISOString(),
            tokenInvalidatedAt: recipient.tokenInvalidatedAt?.toISOString() ?? null,
          }
        : null,
      deliveryAttempts: deliveryAttempts.map((a) => ({
        id: a.id,
        outcome: a.outcome,
        recipientEmail: a.recipientEmail,
        failureCode: a.failureCode,
        failureReason: a.failureReason,
        attemptedBy: a.attemptedBy,
        attemptedAt: a.attemptedAt.toISOString(),
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        completedAt: s.completedAt?.toISOString() ?? null,
        ipAddress: s.ipAddress,
        eventCount: s._count.events,
      })),
      acceptanceRecord: acceptanceRecord
        ? {
            id: acceptanceRecord.id,
            acceptedAt: acceptanceRecord.acceptedAt.toISOString(),
            verifiedEmail: acceptanceRecord.verifiedEmail,
            acceptanceStatement: acceptanceRecord.acceptanceStatement,
            ipAddress: acceptanceRecord.ipAddress,
            locale: acceptanceRecord.locale,
            timezone: acceptanceRecord.timezone,
          }
        : null,
      certificate,
    };
  }

  // ── Timeline ──────────────────────────────────────────────────────────────────
  // Reconstructs a human-readable, chronologically ordered sequence of events
  // for an offer. Suitable for dispute review by non-technical staff.
  //
  // Sources:
  //   OfferSnapshot.frozenAt            — offer sent
  //   OfferDeliveryAttempt rows         — delivery outcome
  //   SigningEvents across all sessions — all recipient interactions
  //   AcceptanceCertificate.issuedAt    — certificate issued
  //
  // NOTE: timeline is READ-ONLY. Nothing written here.

  async buildTimeline(offerId: string): Promise<TimelineEntry[]> {
    const offer = await this.db.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offer not found.');

    const entries: TimelineEntry[] = [];

    // ── Offer snapshot (send event) ───────────────────────────────────────────
    const snapshot = await this.db.offerSnapshot.findUnique({
      where: { offerId },
      include: { records: { select: { id: true } } },
    });

    if (snapshot) {
      entries.push({
        timestamp: snapshot.frozenAt.toISOString(),
        event: 'Offer sent',
        actor: 'sender',
        detail: `Frozen snapshot created. Content hash: ${snapshot.contentHash.slice(0, 12)}…`,
      });
    }

    // ── Delivery attempts ─────────────────────────────────────────────────────
    const deliveryAttempts = await this.db.offerDeliveryAttempt.findMany({
      where: { offerId },
      orderBy: { attemptedAt: 'asc' },
    });

    for (const attempt of deliveryAttempts) {
      const isResend = attempt.attemptedBy !== null;
      if (attempt.outcome === 'DELIVERED_TO_PROVIDER') {
        entries.push({
          timestamp: attempt.attemptedAt.toISOString(),
          event: isResend ? 'Offer link re-sent (email accepted by provider)' : 'Offer link email accepted by provider',
          actor: isResend ? 'support' : 'system',
          detail: `To: ${attempt.recipientEmail}`,
        });
      } else if (attempt.outcome === 'FAILED') {
        entries.push({
          timestamp: attempt.attemptedAt.toISOString(),
          event: isResend ? 'Offer link re-send failed' : 'Offer link email delivery failed',
          actor: isResend ? 'support' : 'system',
          detail: attempt.failureReason
            ? `Error: ${attempt.failureReason}${attempt.failureCode ? ` (HTTP ${attempt.failureCode})` : ''}`
            : null,
        });
      }
    }

    // ── Signing events across all sessions ────────────────────────────────────
    const sessions = await this.db.signingSession.findMany({
      where: { offerId },
      orderBy: { startedAt: 'asc' },
      select: { id: true, startedAt: true },
    });

    for (const session of sessions) {
      const events = await this.db.signingEvent.findMany({
        where: { sessionId: session.id },
        orderBy: { sequenceNumber: 'asc' },
      });

      for (const ev of events) {
        const entry = this.signingEventToTimelineEntry(ev);
        if (entry) entries.push(entry);
      }
    }

    // ── Certificate ───────────────────────────────────────────────────────────
    const cert = await this.db.acceptanceCertificate.findUnique({
      where: { offerId },
    });
    if (cert) {
      entries.push({
        timestamp: cert.issuedAt.toISOString(),
        event: 'Acceptance certificate issued',
        actor: 'system',
        detail: `Certificate ID: ${cert.id}`,
      });
    }

    // Sort all entries by timestamp ascending
    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return entries;
  }

  // ── Signing session events: session lookup for support ────────────────────────
  // Returns the raw signing events for a session in sequence order.
  // Useful for deep inspection during a dispute.

  async getSessionEvents(sessionId: string): Promise<Array<{
    sequenceNumber: number;
    eventType: string;
    timestamp: string;
    payload: unknown;
    ipAddress: string | null;
  }>> {
    // Verify session exists
    const session = await this.db.signingSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Session not found.');

    const events = await this.db.signingEvent.findMany({
      where: { sessionId },
      orderBy: { sequenceNumber: 'asc' },
    });

    return events.map((e) => ({
      sequenceNumber: e.sequenceNumber,
      eventType: e.eventType,
      timestamp: e.timestamp.toISOString(),
      payload: e.payload,
      ipAddress: e.ipAddress,
    }));
  }

  // ── Safe actions ──────────────────────────────────────────────────────────────

  // Revoke a SENT offer. Delegates to SendOfferService which enforces domain rules.
  // Only allowed on SENT offers. Immutable evidence is not affected.
  async revokeOffer(offerId: string): Promise<void> {
    // Locate the offer to get its orgId (SendOfferService requires it)
    const offer = await this.db.offer.findUnique({
      where: { id: offerId },
      select: { organizationId: true },
    });
    if (!offer) throw new NotFoundException('Offer not found.');

    await this.sendOfferService.revoke(offerId, offer.organizationId);
  }

  // Resend the offer link email. Delegates to SendOfferService which:
  //   - generates a new token (old link superseded)
  //   - creates a new OfferDeliveryAttempt with attemptedBy = agentUserId
  //   - reads content from frozen OfferSnapshot (no snapshot mutation)
  async resendOfferLink(
    offerId: string,
    agentUserId: string,
  ): Promise<{ deliveryAttemptId: string; deliveryOutcome: string }> {
    const offer = await this.db.offer.findUnique({
      where: { id: offerId },
      select: { organizationId: true },
    });
    if (!offer) throw new NotFoundException('Offer not found.');

    return this.sendOfferService.resend(offerId, offer.organizationId, agentUserId);
  }

  // Resend OTP to an active signing session.
  // Delegates to SigningFlowService.issueOtpForSession() which enforces:
  //   - session must be AWAITING_OTP (not terminal)
  //   - session must not be expired
  // Returns only the masked delivery address and expiry — never the raw code.
  async resendSessionOtp(
    sessionId: string,
    ctx: SessionContext,
  ): Promise<{ deliveryAddressMasked: string; expiresAt: string }> {
    const result: IssuedOtpResult = await this.signingFlowService.issueOtpForSession(
      sessionId,
      ctx,
    );

    return {
      deliveryAddressMasked: result.deliveryAddressMasked,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private signingEventToTimelineEntry(
    ev: {
      eventType: string;
      timestamp: Date;
      payload: unknown;
      ipAddress: string | null;
    },
  ): TimelineEntry | null {
    const ts = ev.timestamp.toISOString();
    const payload = ev.payload as Record<string, unknown> | null;

    switch (ev.eventType) {
      case 'SESSION_STARTED':
        return { timestamp: ts, event: 'Recipient opened signing link (session started)', actor: 'recipient', detail: ev.ipAddress ? `IP: ${ev.ipAddress}` : null };
      case 'OTP_ISSUED':
        return { timestamp: ts, event: 'OTP code sent to recipient', actor: 'system', detail: payload?.deliveryAddress ? `Sent to: ${maskEmail(String(payload.deliveryAddress))}` : null };
      case 'OTP_ATTEMPT_FAILED':
        return { timestamp: ts, event: 'Incorrect OTP code submitted', actor: 'recipient', detail: payload?.attemptCount ? `Attempt ${payload.attemptCount}` : null };
      case 'OTP_MAX_ATTEMPTS':
        return { timestamp: ts, event: 'OTP locked — maximum failed attempts reached', actor: 'recipient', detail: 'Recipient must request a new code' };
      case 'OTP_VERIFIED':
        return { timestamp: ts, event: 'OTP verified — email ownership confirmed', actor: 'recipient', detail: ev.ipAddress ? `IP: ${ev.ipAddress}` : null };
      case 'DOCUMENT_VIEWED':
        return { timestamp: ts, event: 'Document viewed', actor: 'recipient', detail: payload?.filename ? `File: ${payload.filename}` : null };
      case 'OFFER_ACCEPTED':
        return { timestamp: ts, event: 'Offer accepted', actor: 'recipient', detail: ev.ipAddress ? `IP: ${ev.ipAddress}` : null };
      case 'OFFER_DECLINED':
        return { timestamp: ts, event: 'Offer declined', actor: 'recipient', detail: ev.ipAddress ? `IP: ${ev.ipAddress}` : null };
      case 'SESSION_EXPIRED':
        return { timestamp: ts, event: 'Signing session expired', actor: 'system', detail: null };
      case 'SESSION_ABANDONED':
        return { timestamp: ts, event: 'Signing session abandoned', actor: 'system', detail: null };
      default:
        return null;
    }
  }
}

// Mask email for non-sensitive display (mirrors SigningOtpService.maskEmail)
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.slice(0, 2);
  return `${visible.padEnd(local.length, '*')}@${domain}`;
}
