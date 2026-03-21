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
  SessionExpiredError,
  ConcurrencyConflictError,
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

    // Return the created challenge ID directly from the transaction — do not re-query
    // after the fact. A post-transaction findFirst could return a different challenge
    // if two OTPs are issued in rapid succession for the same session.
    const { challengeId } = await this.db.$transaction(async (tx) => {
      // Invalidate any existing PENDING challenges for this session
      await tx.signingOtpChallenge.updateMany({
        where: { sessionId, status: 'PENDING' },
        data: { status: 'INVALIDATED', invalidatedAt: new Date() },
      });

      const created = await tx.signingOtpChallenge.create({
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
        select: { id: true },
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

      return { challengeId: created.id };
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
        challengeId,
        deliveryAddressMasked: maskEmail(deliveryAddress),
        expiresAt,
      },
    };
  }

  // Atomically verifies the OTP code and advances session + recipient to OTP_VERIFIED.
  //
  // This is the primary verification method used by the signing flow.
  // All state changes happen in a single $transaction — there is no split-brain state
  // where the challenge is VERIFIED but the session is still AWAITING_OTP.
  //
  // Binding validation:
  //   - challenge.recipientId must match the provided recipientId
  //   - session is loaded from challenge.sessionId (not from "latest resumable")
  //   - session must be AWAITING_OTP and not expired
  //
  // On success, one atomic transaction:
  //   1. SigningOtpChallenge → VERIFIED
  //   2. SigningSession → OTP_VERIFIED (otpVerifiedAt set)
  //   3. OfferRecipient → OTP_VERIFIED
  //   4. OTP_VERIFIED SigningEvent appended (exactly once)
  //
  // On failure, the challenge attempt count is incremented (also in a transaction).
  // No session or recipient state changes on failure.
  async verifyAndAdvanceSession(
    challengeId: string,
    recipientId: string,
    rawCode: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<VerifyOtpResult> {
    // ── Load and validate the challenge ───────────────────────────────────────
    const challenge = await this.db.signingOtpChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge || challenge.recipientId !== recipientId) {
      // Treat missing challenge or recipient mismatch the same way —
      // no session or recipient state change; same error to prevent enumeration.
      throw new OtpChallengeMismatchError();
    }

    const effectiveStatus = deriveOtpStatus(challenge);

    switch (effectiveStatus) {
      case 'VERIFIED':    throw new OtpAlreadyVerifiedError();
      case 'EXPIRED':     throw new OtpExpiredError();
      case 'LOCKED':      throw new OtpLockedError();
      case 'INVALIDATED': throw new OtpInvalidatedError();
    }

    // ── Load and validate the session bound to this challenge ─────────────────
    // We derive the session from the challenge — not from "latest resumable".
    // This is the authoritative binding: the challenge was issued for this session,
    // so this is the session that must be advanced.
    const session = await this.db.signingSession.findUnique({
      where: { id: challenge.sessionId },
    });

    if (!session || session.status !== 'AWAITING_OTP' || session.expiresAt <= new Date()) {
      // Session is gone, in the wrong state, or expired — cannot verify.
      throw new SessionExpiredError();
    }

    // ── Load recipient version for optimistic concurrency check ───────────────
    const recipient = await this.db.offerRecipient.findUnique({
      where: { id: recipientId },
      select: { id: true, version: true },
    });
    if (!recipient) throw new OtpChallengeMismatchError();

    // ── Verify the submitted code ─────────────────────────────────────────────
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
            sessionId: session.id,
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

    // ── Correct code — atomic state advancement ───────────────────────────────
    // All four updates happen in one transaction. If any step fails, the entire
    // transaction rolls back and no partial state is persisted.
    otpStateMachine.assertTransition(effectiveStatus, 'VERIFIED');
    const verifiedAt = new Date();

    await this.db.$transaction(async (tx) => {
      // 1. Mark the OTP challenge as verified
      await tx.signingOtpChallenge.update({
        where: { id: challengeId },
        data: { status: 'VERIFIED', verifiedAt },
      });

      // 2. Advance the session to OTP_VERIFIED — with optimistic concurrency check.
      const sessionUpdate = await tx.signingSession.updateMany({
        where: { id: session.id, version: session.version },
        data: { status: 'OTP_VERIFIED', otpVerifiedAt: verifiedAt, version: { increment: 1 } },
      });
      if (sessionUpdate.count === 0) throw new ConcurrencyConflictError('SigningSession');

      // 3. Advance the recipient to OTP_VERIFIED — with optimistic concurrency check.
      const recipientUpdate = await tx.offerRecipient.updateMany({
        where: { id: recipientId, version: recipient.version },
        data: { status: 'OTP_VERIFIED', version: { increment: 1 } },
      });
      if (recipientUpdate.count === 0) throw new ConcurrencyConflictError('OfferRecipient');

      // 4. Append the OTP_VERIFIED event (exactly once — no duplicate from session service)
      await this.eventService.append(
        {
          sessionId: session.id,
          eventType: 'OTP_VERIFIED',
          payload: { challengeId, channel: challenge.channel },
          ...context,
        },
        tx as unknown as PrismaClient,
      );
    });

    return { verified: true, verifiedAt };
  }

  // Legacy single-step verify method.
  // Does NOT advance session or recipient — used only where the caller manages
  // those transitions separately (e.g., support-side re-verification in future).
  // The primary signing flow uses verifyAndAdvanceSession() instead.
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
