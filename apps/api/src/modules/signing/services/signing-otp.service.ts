import * as crypto from 'crypto';
import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, SigningOtpChallenge } from '@prisma/client';
import { otpStateMachine, deriveOtpStatus } from '../domain/signing-otp.state-machine';
import { SigningEventService } from './signing-event.service';
import { EmailPort, EMAIL_PORT } from '../../../common/email/email.port';
import {
  OtpExpiredError,
  OtpLockedError,
  OtpInvalidError,
  OtpAlreadyVerifiedError,
  OtpInvalidatedError,
  OtpChallengeMismatchError,
} from '../../../common/errors/domain.errors';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

export interface IssuedOtpResult {
  challengeId: string;
  deliveryAddressMasked: string;
  expiresAt: Date;
}

export interface VerifyOtpResult {
  verified: true;
  verifiedAt: Date;
}

@Injectable()
export class SigningOtpService {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    @Inject(EMAIL_PORT) private readonly emailPort: EmailPort,
    private readonly eventService: SigningEventService,
  ) {}

  // Issues a new OTP for a session.
  // Invalidates any existing PENDING challenges first.
  // Sends the raw code via the email port — raw code is never stored.
  async issue(
    sessionId: string,
    recipientId: string,
    deliveryAddress: string,
    recipientName: string,
    offerTitle: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ rawCode: string; result: IssuedOtpResult }> {
    const { rawCode, codeHash } = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.db.$transaction(async (tx) => {
      // Invalidate any existing PENDING challenges for this session
      await tx.signingOtpChallenge.updateMany({
        where: { sessionId, status: 'PENDING' },
        data: { status: 'INVALIDATED', invalidatedAt: new Date() },
      });

      await tx.signingOtpChallenge.create({
        data: {
          sessionId,
          recipientId,
          channel: 'EMAIL',
          deliveryAddress,
          codeHash,
          status: 'PENDING',
          expiresAt,
          maxAttempts: MAX_ATTEMPTS,
        },
      });

      await this.eventService.append(
        {
          sessionId,
          eventType: 'OTP_ISSUED',
          payload: { channel: 'EMAIL', deliveryAddress },
          ...context,
        },
        tx as unknown as PrismaClient,
      );
    });

    // Fetch the created challenge ID (created in the transaction above)
    const challenge = await this.db.signingOtpChallenge.findFirst({
      where: { sessionId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    // Send email AFTER the DB transaction commits.
    // If email sending fails, the challenge exists in the DB but no code was delivered.
    // The recipient can request a new OTP — that will invalidate this one.
    await this.emailPort.sendOtp({
      to: deliveryAddress,
      recipientName,
      code: rawCode,
      offerTitle,
      expiresAt,
    });

    return {
      rawCode, // returned for dev/test use ONLY — must not be logged by callers
      result: {
        challengeId: challenge!.id,
        deliveryAddressMasked: maskEmail(deliveryAddress),
        expiresAt,
      },
    };
  }

  // Verifies a submitted OTP code.
  // Throws typed errors for all failure modes — never returns false.
  async verify(
    challengeId: string,
    sessionId: string,
    rawCode: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<VerifyOtpResult> {
    const challenge = await this.db.signingOtpChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge || challenge.sessionId !== sessionId) {
      throw new OtpChallengeMismatchError();
    }

    const effectiveStatus = deriveOtpStatus(challenge);

    switch (effectiveStatus) {
      case 'VERIFIED':    throw new OtpAlreadyVerifiedError();
      case 'EXPIRED':     throw new OtpExpiredError();
      case 'LOCKED':      throw new OtpLockedError();
      case 'INVALIDATED': throw new OtpInvalidatedError();
    }

    const isCorrect = this.verifyCode(rawCode, challenge.codeHash);

    if (!isCorrect) {
      const newAttemptCount = challenge.attemptCount + 1;
      const isNowLocked = newAttemptCount >= challenge.maxAttempts;

      await this.db.$transaction(async (tx) => {
        await tx.signingOtpChallenge.update({
          where: { id: challengeId },
          data: {
            attemptCount: newAttemptCount,
            ...(isNowLocked ? { status: 'LOCKED' } : {}),
          },
        });

        await this.eventService.append(
          {
            sessionId,
            eventType: isNowLocked ? 'OTP_MAX_ATTEMPTS' : 'OTP_ATTEMPT_FAILED',
            payload: { challengeId, attemptCount: newAttemptCount },
            ...context,
          },
          tx as unknown as PrismaClient,
        );
      });

      if (isNowLocked) throw new OtpLockedError();
      throw new OtpInvalidError(challenge.maxAttempts - newAttemptCount);
    }

    // Correct code
    otpStateMachine.assertTransition(effectiveStatus, 'VERIFIED');
    const verifiedAt = new Date();

    await this.db.$transaction(async (tx) => {
      await tx.signingOtpChallenge.update({
        where: { id: challengeId },
        data: { status: 'VERIFIED', verifiedAt },
      });

      await this.eventService.append(
        {
          sessionId,
          eventType: 'OTP_VERIFIED',
          payload: { challengeId, channel: challenge.channel },
          ...context,
        },
        tx as unknown as PrismaClient,
      );
    });

    return { verified: true, verifiedAt };
  }

  getActiveChallenge(sessionId: string): Promise<SigningOtpChallenge | null> {
    return this.db.signingOtpChallenge.findFirst({
      where: { sessionId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  private generateCode(): { rawCode: string; codeHash: string } {
    const code = crypto.randomInt(100_000, 1_000_000);
    const rawCode = String(code);
    const codeHash = crypto.createHash('sha256').update(rawCode, 'utf8').digest('hex');
    return { rawCode, codeHash };
  }

  private verifyCode(rawCode: string, storedHash: string): boolean {
    const computedHash = crypto.createHash('sha256').update(rawCode, 'utf8').digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computedHash, 'hex'),
        Buffer.from(storedHash, 'hex'),
      );
    } catch {
      return false;
    }
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.slice(0, 2);
  return `${visible.padEnd(local.length, '*')}@${domain}`;
}
