import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SigningTokenService } from './signing-token.service';
import { SigningSessionService, SessionContext } from './signing-session.service';
import { SigningOtpService, IssuedOtpResult, VerifyOtpResult } from './signing-otp.service';
import { DealEventService } from '../../deal-events/deal-events.service';
import {
  InvalidStateTransitionError,
  OfferExpiredError,
  SessionExpiredError,
  TokenInvalidError,
} from '../../../common/errors/domain.errors';

@Injectable()
export class SigningOtpOrchestrator {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly tokenService: SigningTokenService,
    private readonly sessionService: SigningSessionService,
    private readonly otpService: SigningOtpService,
    private readonly dealEventService: DealEventService,
  ) {}

  async requestOtp(rawToken: string, ctx: SessionContext): Promise<IssuedOtpResult> {
    const recipient = await this.tokenService.verifyToken(rawToken);

    const offer = await this.db.offer.findUniqueOrThrow({ where: { id: recipient.offerId } });
    if (offer.status !== 'SENT') throw new TokenInvalidError();
    if (offer.expiresAt && offer.expiresAt <= new Date()) throw new OfferExpiredError();

    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { offerId: offer.id },
    });

    if (recipient.status === 'PENDING') {
      await this.db.offerRecipient.update({
        where: { id: recipient.id },
        data: { status: 'VIEWED', viewedAt: new Date() },
      });
      void this.dealEventService.emit(offer.id, 'deal_opened');
    }

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

  async verifyOtp(
    rawToken: string,
    challengeId: string,
    rawCode: string,
    ctx: SessionContext,
  ): Promise<VerifyOtpResult> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const result = await this.otpService.verifyAndAdvanceSession(challengeId, recipient.id, rawCode, ctx);
    void this.dealEventService.emit(recipient.offerId, 'otp_verified');
    return result;
  }

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
}
