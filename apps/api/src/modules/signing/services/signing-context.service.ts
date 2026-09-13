import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SigningTokenService } from './signing-token.service';
import { SigningSessionService, SessionContext } from './signing-session.service';
import { SigningEventService } from './signing-event.service';
import {
  OfferAlreadyAcceptedError,
  OfferExpiredError,
  TokenInvalidError,
} from '../../../common/errors/domain.errors';
import { buildAcceptanceStatement } from '../domain/acceptance-statement';

export interface OfferContext {
  sessionId: string;
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
  acceptanceStatement: string;
}

@Injectable()
export class SigningContextService {
  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly tokenService: SigningTokenService,
    private readonly sessionService: SigningSessionService,
    private readonly eventService: SigningEventService,
  ) {}

  async getOfferContext(rawToken: string): Promise<OfferContext> {
    const recipient = await this.tokenService.verifyToken(rawToken);

    const offer = await this.db.offer.findUniqueOrThrow({ where: { id: recipient.offerId } });

    if (offer.status === 'ACCEPTED') {
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
      throw new TokenInvalidError();
    }

    if (offer.expiresAt && offer.expiresAt <= new Date()) {
      throw new OfferExpiredError();
    }

    const snapshot = await this.db.offerSnapshot.findUniqueOrThrow({
      where: { offerId: recipient.offerId },
      include: { documents: true },
    });

    const existingSession = await this.sessionService.findResumable(recipient.id);

    return {
      sessionId: existingSession?.id ?? '',
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
        recipientEmail: recipient.email,
        offerTitle: snapshot.title,
        offerVersion: snapshot.version,
        offerDate: snapshot.frozenAt,
        senderName: snapshot.senderName,
        senderEmail: snapshot.senderEmail,
      }),
    };
  }

  async recordDocumentView(
    rawToken: string,
    documentId: string,
    ctx: SessionContext,
  ): Promise<void> {
    const recipient = await this.tokenService.verifyToken(rawToken);
    const existingSession = await this.sessionService.findResumable(recipient.id);
    if (!existingSession) return;

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
}
