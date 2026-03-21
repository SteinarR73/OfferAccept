import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'pg-boss';
import type { ExpireOffersPayload } from '../job.types';

// ─── ExpireOffersHandler ───────────────────────────────────────────────────────
// Batch sweep: marks SENT offers whose expiresAt has passed as EXPIRED, and
// cascades to the recipient row.
//
// Idempotency:
//   updateMany(WHERE status = 'SENT' AND expiresAt < NOW()) is safe to run
//   multiple times — terminal-status offers are ignored by the WHERE clause.
//
// Schedule: every 30 minutes (offers rarely need sub-minute precision).
//
// Cascade logic:
//   1. Find SENT offer IDs that have expired.
//   2. Update Offer.status → EXPIRED for those IDs.
//   3. Update OfferRecipient.status → EXPIRED for those offer IDs.
//   Steps 2 and 3 are not atomic — a crash between them leaves the recipient
//   in a stale state. The signing flow guards against this by checking
//   offer.status before processing any token, so partial state is safe.

@Injectable()
export class ExpireOffersHandler {
  private readonly logger = new Logger(ExpireOffersHandler.name);

  constructor(@Inject('PRISMA') private readonly db: PrismaClient) {}

  async handle(jobs: Job<ExpireOffersPayload>[]): Promise<void> {
    const now = new Date();

    // Step 1: collect expired offer IDs.
    const expiredOffers = await this.db.offer.findMany({
      where: {
        status: 'SENT',
        expiresAt: { lt: now },
      },
      select: { id: true },
    });

    if (expiredOffers.length === 0) {
      void jobs;
      return;
    }

    const offerIds = expiredOffers.map((o) => o.id);

    // Step 2: expire offers.
    const offerResult = await this.db.offer.updateMany({
      where: { id: { in: offerIds } },
      data: { status: 'EXPIRED' },
    });

    // Step 3: expire recipients that are not yet in a terminal state.
    const recipientResult = await this.db.offerRecipient.updateMany({
      where: {
        offerId: { in: offerIds },
        status: { notIn: ['ACCEPTED', 'DECLINED', 'EXPIRED'] },
      },
      data: { status: 'EXPIRED' },
    });

    this.logger.log(
      `Expired ${offerResult.count} offer(s) and ${recipientResult.count} recipient(s)`,
    );

    void jobs;
  }
}
