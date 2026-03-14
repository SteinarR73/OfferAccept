import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, SigningSession, SessionStatus } from '@prisma/client';
import { sessionStateMachine } from '../domain/signing-session.state-machine';
import { SigningEventService } from './signing-event.service';
import { SessionExpiredError } from '../../../common/errors/domain.errors';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface SessionContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SigningSessionService {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly eventService: SigningEventService,
  ) {}

  // Creates a new signing session for a recipient.
  // Session is bound to the snapshot — not the mutable offer.
  async create(
    recipientId: string,
    offerId: string,
    snapshotId: string,
    context: SessionContext,
  ): Promise<SigningSession> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const session = await this.db.$transaction(async (tx) => {
      const created = await tx.signingSession.create({
        data: {
          recipientId,
          offerId,
          snapshotId,
          status: 'AWAITING_OTP',
          expiresAt,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      await this.eventService.append(
        {
          sessionId: created.id,
          eventType: 'SESSION_STARTED',
          payload: { snapshotId },
          ...context,
        },
        tx as unknown as PrismaClient,
      );

      return created;
    });

    return session;
  }

  // Returns a session by ID. Throws SessionExpiredError if the session TTL has passed.
  // Does NOT automatically expire the session — expiry is a background job concern.
  async getAndValidate(sessionId: string): Promise<SigningSession> {
    const session = await this.db.signingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionExpiredError();
    }

    // Check TTL even if the status hasn't been updated by the background job yet
    if (sessionStateMachine.isTerminal(session.status) || session.expiresAt <= new Date()) {
      throw new SessionExpiredError();
    }

    return session;
  }

  // Transitions a session to a new status. Validates via the state machine.
  // Emits the appropriate signing event for transitions that require one.
  async transition(
    session: SigningSession,
    to: SessionStatus,
    context: SessionContext,
    eventPayload?: Record<string, unknown>,
  ): Promise<SigningSession> {
    sessionStateMachine.assertTransition(session.status, to);

    const eventType = SESSION_TRANSITION_EVENTS[to];
    const isCompletion = ['ACCEPTED', 'DECLINED', 'EXPIRED', 'ABANDONED'].includes(to);

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.signingSession.update({
        where: { id: session.id },
        data: {
          status: to,
          ...(to === 'OTP_VERIFIED' ? { otpVerifiedAt: new Date() } : {}),
          ...(isCompletion ? { completedAt: new Date() } : {}),
        },
      });

      if (eventType) {
        await this.eventService.append(
          {
            sessionId: session.id,
            eventType,
            payload: eventPayload ?? null,
            ...context,
          },
          tx as unknown as PrismaClient,
        );
      }

      return result;
    });

    return updated;
  }

  // Finds an existing resumable session for a recipient (AWAITING_OTP or OTP_VERIFIED)
  // that has not yet expired. Used when the recipient re-opens the link on the same device.
  async findResumable(recipientId: string): Promise<SigningSession | null> {
    return this.db.signingSession.findFirst({
      where: {
        recipientId,
        status: { in: ['AWAITING_OTP', 'OTP_VERIFIED'] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
    });
  }
}

// Maps session status transitions to the SigningEventType that must be emitted.
// Not all transitions emit events (e.g., AWAITING_OTP has no inbound transition event
// beyond SESSION_STARTED which is emitted in create()).
//
// OTP_VERIFIED is intentionally absent: the OTP_VERIFIED event is emitted exclusively
// inside SigningOtpService.verifyAndAdvanceSession() as part of the atomic transaction
// that also marks the challenge VERIFIED, advances the session, and advances the
// recipient. Omitting it here prevents any accidental double-event emission if
// transition() is ever called for that state.
const SESSION_TRANSITION_EVENTS: Partial<Record<SessionStatus, import('@prisma/client').SigningEventType>> = {
  ACCEPTED: 'OFFER_ACCEPTED',
  DECLINED: 'OFFER_DECLINED',
  EXPIRED: 'SESSION_EXPIRED',
  ABANDONED: 'SESSION_ABANDONED',
};
