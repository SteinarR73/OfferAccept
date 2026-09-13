import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient, SigningSession } from '@prisma/client';
import { SigningTokenService } from './signing-token.service';
import { SigningSessionService, SessionContext } from './signing-session.service';
import { AcceptanceService, AcceptanceContext, AcceptanceResult } from './acceptance.service';
import { CertificateService } from '../../certificates/certificate.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DealDeclinedEvent } from '../../notifications/events/deal-declined.event';
import { WebhookService } from '../../enterprise/webhook.service';
import { DealEventService } from '../../deal-events/deal-events.service';
import { JobService } from '../../jobs/job.service';
import { TraceContext } from '../../../common/trace/trace.context';
import {
  OtpChallengeMismatchError,
  SessionExpiredError,
} from '../../../common/errors/domain.errors';

@Injectable()
export class SigningDecisionOrchestrator {
  private readonly logger = new Logger(SigningDecisionOrchestrator.name);

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly tokenService: SigningTokenService,
    private readonly sessionService: SigningSessionService,
    private readonly acceptanceService: AcceptanceService,
    private readonly certificateService: CertificateService,
    private readonly notificationsService: NotificationsService,
    private readonly webhookService: WebhookService,
    private readonly dealEventService: DealEventService,
    private readonly jobService: JobService,
    private readonly traceContext: TraceContext,
  ) {}

  async accept(
    rawToken: string,
    challengeId: string,
    context: AcceptanceContext,
  ): Promise<AcceptanceResult & { certificateId: string | null }> {
    const recipient = await this.tokenService.verifyToken(rawToken);

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

    if (notifyJobId) {
      this.logger.log(JSON.stringify({
        metric: 'notify_deal_accepted_enqueued',
        traceId,
        offerId: result.offerId,
        acceptanceRecordId: result.acceptanceRecord.id,
        jobId: notifyJobId,
      }));
    }

    try {
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

  async decline(rawToken: string, challengeId: string | undefined, ctx: SessionContext): Promise<void> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const session = challengeId
      ? await this.getSessionFromChallenge(challengeId, recipient.id)
      : await this.sessionService.findResumable(recipient.id);
    
    if (!session) throw new SessionExpiredError();
    
    await this.acceptanceService.decline(session, ctx);
    void this.dealEventService.emit(session.offerId, 'deal_declined');

    await this.db.reminderSchedule.deleteMany({ where: { offerId: session.offerId } }).catch((e: unknown) =>
      this.logger.warn(`Failed to delete reminder schedule on decline for offer ${session.offerId}: ${e}`),
    );

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

    return this.sessionService.getAndValidate(challenge.sessionId);
  }

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
