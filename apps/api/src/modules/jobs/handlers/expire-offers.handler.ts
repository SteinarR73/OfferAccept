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
//   1. Find SENT offer IDs that have expired (outside the transaction — read-only).
//   2. In a single transaction:
//      a. Update Offer.status → EXPIRED for those IDs.
//      b. Update OfferRecipient.status → EXPIRED for those offer IDs.
//   The transaction ensures that a crash or error after step 2a cannot leave
//   OfferRecipient rows in a stale SENT state while the parent Offer is EXPIRED.

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

    // Steps 2 + 3: atomic — both updates commit or both roll back.
    const [offerResult, recipientResult] = await this.db.$transaction([
      // Step 2: expire offers.
      this.db.offer.updateMany({
        where: { id: { in: offerIds } },
        data: { status: 'EXPIRED' },
      }),
      // Step 3: expire recipients that are not yet in a terminal state.
      this.db.offerRecipient.updateMany({
        where: {
          offerId: { in: offerIds },
          status: { notIn: ['ACCEPTED', 'DECLINED', 'EXPIRED'] },
        },
        data: { status: 'EXPIRED' },
      }),
    ]);

    this.logger.log(
      `Expired ${offerResult.count} offer(s) and ${recipientResult.count} recipient(s)`,
    );

    void jobs;
  }
}
