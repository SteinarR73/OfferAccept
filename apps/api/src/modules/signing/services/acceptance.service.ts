import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient, SigningSession, AcceptanceRecord } from '@prisma/client';
import { offerStateMachine } from '../../offers/domain/offer.state-machine';
import { recipientStateMachine } from '../../offers/domain/offer-recipient.state-machine';
import { sessionStateMachine } from '../domain/signing-session.state-machine';
import { SigningEventService } from './signing-event.service';
import { buildAcceptanceStatement } from '../domain/acceptance-statement';
import {
  SessionNotVerifiedError,
  OtpChallengeMismatchError,
  OfferExpiredError,
  OfferAlreadyAcceptedError,
  InvalidStateTransitionError,
} from '../../../common/errors/domain.errors';

export interface AcceptanceContext {
  ipAddress?: string;
  userAgent?: string;
  locale?: string;
  timezone?: string;
}

export interface AcceptanceResult {
  acceptanceRecord: AcceptanceRecord;
  certificateId: string | null;
  // Snapshot + recipient data — already loaded during accept(); passed through so
  // callers (SigningFlowService) can send notification emails without re-querying.
  offerTitle: string;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
}

@Injectable()
export class AcceptanceService {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly eventService: SigningEventService,
  ) {}

  // Confirms final acceptance.
  //
  // Preconditions (all checked before any DB write):
  //   1. session.status === OTP_VERIFIED
  //   2. The provided challengeId is VERIFIED and belongs to this session
  //   3. The offer is still SENT (not expired, revoked, or already accepted)
  //   4. The offer.expiresAt has not passed (if set)
  //
  // On success (single atomic transaction):
  //   - AcceptanceRecord is created
  //   - SigningSession transitions to ACCEPTED
  //   - OfferRecipient transitions to ACCEPTED
  //   - Offer transitions to ACCEPTED
  //   - OFFER_ACCEPTED signing event is written (final in chain)
  //
  // Certificate generation is NOT triggered here — it is the responsibility of a
  // background job that runs after this method returns successfully.
  async accept(
    session: SigningSession,
    challengeId: string,
    context: AcceptanceContext,
  ): Promise<AcceptanceResult> {
    // ── Guard 1: session must be OTP_VERIFIED ────────────────────────────────
    if (session.status !== 'OTP_VERIFIED') {
      throw new SessionNotVerifiedError();
    }
    sessionStateMachine.assertTransition(session.status, 'ACCEPTED');

    // ── Guard 2: challenge must be VERIFIED and belong to this session ───────
    const challenge = await this.db.signingOtpChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge || challenge.sessionId !== session.id || challenge.status !== 'VERIFIED') {
      throw new OtpChallengeMismatchError();
    }

    // ── Guard 3 + 4: offer must be SENT and not expired ───────────────────────
    const offer = await this.db.offer.findUniqueOrThrow({ where: { id: session.offerId } });

    if (offer.status !== 'SENT') {
      if (offer.status === 'ACCEPTED') throw new OfferAlreadyAcceptedError();
      if (offer.status === 'EXPIRED') throw new OfferExpiredError();
      throw new InvalidStateTransitionError(offer.status, 'ACCEPTED', 'Offer');
    }

    offerStateMachine.assertTransition(offer.status, 'ACCEPTED');

    if (offer.expiresAt && offer.expiresAt <= new Date()) {
      throw new OfferExpiredError();
    }

    // ── Load supporting data needed for AcceptanceRecord ──────────────────────
    const [recipient, snapshot] = await Promise.all([
      this.db.offerRecipient.findUniqueOrThrow({ where: { id: session.recipientId } }),
      this.db.offerSnapshot.findUniqueOrThrow({ where: { id: session.snapshotId } }),
    ]);

    recipientStateMachine.assertTransition(recipient.status, 'ACCEPTED');

    const acceptedAt = new Date();
    const acceptanceStatement = buildAcceptanceStatement({
      recipientName: recipient.name,
      offerTitle: snapshot.title,
      senderName: snapshot.senderName,
      senderEmail: snapshot.senderEmail,
    });

    // ── Atomic transaction: create evidence, transition all entities ──────────
    const acceptanceRecord = await this.db.$transaction(async (tx) => {
      // Re-verify offer status INSIDE the transaction — this is the authoritative check.
      // updateMany with status='SENT' in the WHERE clause is an atomic compare-and-swap:
      // if count=0, another concurrent accept() already transitioned the offer.
      // The pre-transaction checks above are a fast-fail optimization only.
      const { count: offerCount } = await tx.offer.updateMany({
        where: { id: offer.id, status: 'SENT' },
        data: { status: 'ACCEPTED' },
      });

      if (offerCount === 0) {
        const current = await tx.offer.findUniqueOrThrow({ where: { id: offer.id } });
        if (current.status === 'ACCEPTED') throw new OfferAlreadyAcceptedError();
        if (current.status === 'EXPIRED') throw new OfferExpiredError();
        throw new InvalidStateTransitionError(current.status, 'ACCEPTED', 'Offer');
      }

      const record = await tx.acceptanceRecord.create({
        data: {
          sessionId: session.id,
          recipientId: recipient.id,
          snapshotId: snapshot.id,
          acceptanceStatement,
          verifiedEmail: challenge.deliveryAddress,
          emailVerifiedAt: challenge.verifiedAt!,
          acceptedAt,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          locale: context.locale,
          timezone: context.timezone,
          snapshotContentHash: snapshot.contentHash,
        },
      });

      await tx.signingSession.update({
        where: { id: session.id },
        data: { status: 'ACCEPTED', completedAt: acceptedAt },
      });

      await tx.offerRecipient.update({
        where: { id: recipient.id },
        data: { status: 'ACCEPTED', respondedAt: acceptedAt },
      });

      // OFFER_ACCEPTED is the terminal event in the signing chain.
      // No further events will be appended to this session after this.
      await this.eventService.append(
        {
          sessionId: session.id,
          eventType: 'OFFER_ACCEPTED',
          payload: {
            acceptanceRecordId: record.id,
            verifiedEmail: challenge.deliveryAddress,
            acceptedAt: acceptedAt.toISOString(),
            snapshotContentHash: snapshot.contentHash,
          },
          ...context,
        },
        tx as unknown as PrismaClient,
      );

      return record;
    });

    return {
      acceptanceRecord,
      certificateId: null,
      offerTitle: snapshot.title,
      senderName: snapshot.senderName,
      senderEmail: snapshot.senderEmail,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
    };
  }

  // Records that the recipient explicitly declined the offer.
  async decline(
    session: SigningSession,
    context: AcceptanceContext,
  ): Promise<void> {
    sessionStateMachine.assertTransition(session.status, 'DECLINED');

    const [recipient, offer] = await Promise.all([
      this.db.offerRecipient.findUniqueOrThrow({ where: { id: session.recipientId } }),
      this.db.offer.findUniqueOrThrow({ where: { id: session.offerId } }),
    ]);

    offerStateMachine.assertTransition(offer.status, 'DECLINED');

    const declinedAt = new Date();

    await this.db.$transaction(async (tx) => {
      // Atomic check-and-update: prevent double-decline or declining an already-accepted offer.
      const { count: offerCount } = await tx.offer.updateMany({
        where: { id: offer.id, status: 'SENT' },
        data: { status: 'DECLINED' },
      });

      if (offerCount === 0) {
        const current = await tx.offer.findUniqueOrThrow({ where: { id: offer.id } });
        if (current.status === 'ACCEPTED') throw new OfferAlreadyAcceptedError();
        throw new InvalidStateTransitionError(current.status, 'DECLINED', 'Offer');
      }

      await tx.signingSession.update({
        where: { id: session.id },
        data: { status: 'DECLINED', completedAt: declinedAt },
      });

      await tx.offerRecipient.update({
        where: { id: recipient.id },
        data: { status: 'DECLINED', respondedAt: declinedAt },
      });

      await this.eventService.append(
        {
          sessionId: session.id,
          eventType: 'OFFER_DECLINED',
          payload: { declinedAt: declinedAt.toISOString() },
          ...context,
        },
        tx as unknown as PrismaClient,
      );
    });
  }
}
