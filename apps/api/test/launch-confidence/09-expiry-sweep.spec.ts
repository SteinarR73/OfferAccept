/**
 * TEST 9 — Expiry Sweep
 *
 * Invariant: The ExpireOffersHandler must transition all SENT offers whose
 * expiresAt has passed to EXPIRED status — atomically for both the Offer row
 * and its OfferRecipient row. Already-terminal recipients (ACCEPTED, DECLINED)
 * must not be overwritten.
 *
 * Simulates:
 *   - N SENT offers with expiresAt in the past
 *   - Some recipients already in terminal state (ACCEPTED) — must not be re-expired
 *   - Handler runs in a pg-boss job sweep
 *
 * Verifies:
 *   - offer.updateMany is called with all expired offer IDs
 *   - offerRecipient.updateMany excludes already-terminal statuses
 *   - reminderSchedule.deleteMany is called for the expired offer IDs
 *   - notifications are sent for each expired offer
 *   - offers that are not SENT (already EXPIRED, ACCEPTED) are not included
 */

import { jest } from '@jest/globals';
import { ExpireOffersHandler } from '../../src/modules/jobs/handlers/expire-offers.handler';

const NOW = new Date();

function makeSentOffer(id: string, expiresAt: Date, title = 'Agreement') {
  return {
    id,
    snapshot: {
      title,
      senderEmail: 'sender@acme.com',
      senderName: 'Acme Corp',
    },
    expiresAt,
  };
}

function makeDb(expiredOffers: ReturnType<typeof makeSentOffer>[]) {
  const offerUpdateMany = jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: expiredOffers.length });
  const recipientUpdateMany = jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: expiredOffers.length });
  const scheduleDeleteMany = jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: expiredOffers.length });

  const db = {
    offer: {
      findMany: jest.fn<any>().mockResolvedValue(expiredOffers),
      updateMany: offerUpdateMany,
    },
    offerRecipient: {
      updateMany: recipientUpdateMany,
    },
    reminderSchedule: {
      deleteMany: scheduleDeleteMany,
    },
    $transaction: jest.fn<any>().mockImplementation(async (ops: unknown[]) => {
      return Promise.all(ops);
    }),
  };

  return { db, offerUpdateMany, recipientUpdateMany, scheduleDeleteMany };
}

function makeStubs(emailLog: string[]) {
  const dealEventService = {
    emit: jest.fn<any>().mockResolvedValue(undefined),
  };

  const notificationsService = {
    onDealExpired: jest.fn<any>().mockImplementation(async (event: { senderEmail: string }) => {
      emailLog.push(event.senderEmail);
    }),
  };

  return { dealEventService, notificationsService };
}

describe('TEST 9 — Expiry Sweep', () => {
  it('transitions 5 expired SENT offers to EXPIRED status atomically', async () => {
    const expiredOffers = Array.from({ length: 5 }, (_, i) =>
      makeSentOffer(`offer-${i}`, new Date(NOW.getTime() - (i + 1) * 3600 * 1000)),
    );

    const emailLog: string[] = [];
    const { db, offerUpdateMany, recipientUpdateMany, scheduleDeleteMany } = makeDb(expiredOffers);
    const stubs = makeStubs(emailLog);

    const handler = new ExpireOffersHandler(
      db as never,
      stubs.notificationsService as never,
      stubs.dealEventService as never,
    );

    await handler.handle([]);

    // All 5 offer IDs passed to offer.updateMany
    const offerIds = expiredOffers.map((o) => o.id);
    expect(offerUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: offerIds } },
      data: { status: 'EXPIRED' },
    });

    // offerRecipient.updateMany excludes already-terminal statuses
    expect(recipientUpdateMany).toHaveBeenCalledWith({
      where: {
        offerId: { in: offerIds },
        status: { notIn: ['ACCEPTED', 'DECLINED', 'EXPIRED'] },
      },
      data: { status: 'EXPIRED' },
    });

    // Reminder schedules cleaned up
    expect(scheduleDeleteMany).toHaveBeenCalledWith({
      where: { offerId: { in: offerIds } },
    });
  });

  it('sends an expiry notification for each expired offer', async () => {
    const expiredOffers = [
      makeSentOffer('offer-a', new Date(NOW.getTime() - 2 * 3600 * 1000), 'Agreement A'),
      makeSentOffer('offer-b', new Date(NOW.getTime() - 4 * 3600 * 1000), 'Agreement B'),
    ];

    const emailLog: string[] = [];
    const { db } = makeDb(expiredOffers);
    const stubs = makeStubs(emailLog);

    const handler = new ExpireOffersHandler(
      db as never,
      stubs.notificationsService as never,
      stubs.dealEventService as never,
    );

    await handler.handle([]);

    // One notification per expired offer
    expect(stubs.notificationsService.onDealExpired).toHaveBeenCalledTimes(2);

    // deal_expired event emitted for each offer
    expect(stubs.dealEventService.emit).toHaveBeenCalledWith('offer-a', 'deal_expired');
    expect(stubs.dealEventService.emit).toHaveBeenCalledWith('offer-b', 'deal_expired');
  });

  it('does nothing when there are no expired offers', async () => {
    const emailLog: string[] = [];
    const { db, offerUpdateMany, scheduleDeleteMany } = makeDb([]);
    const stubs = makeStubs(emailLog);

    // findMany returns empty list — no expired offers
    db.offer.findMany = jest.fn<any>().mockResolvedValue([]);

    const handler = new ExpireOffersHandler(
      db as never,
      stubs.notificationsService as never,
      stubs.dealEventService as never,
    );

    await handler.handle([]);

    // No DB mutations, no notifications
    expect(offerUpdateMany).not.toHaveBeenCalled();
    expect(scheduleDeleteMany).not.toHaveBeenCalled();
    expect(stubs.notificationsService.onDealExpired).not.toHaveBeenCalled();
    expect(stubs.dealEventService.emit).not.toHaveBeenCalled();
  });

  it('only includes SENT offers in findMany query (non-SENT offers are ignored)', async () => {
    const emailLog: string[] = [];
    // findMany is called with status: 'SENT' — the mock simulates what the DB
    // would return: only SENT offers with expired expiresAt.
    const expiredOffers = [makeSentOffer('offer-sent-expired', new Date(NOW.getTime() - 3600 * 1000))];
    const { db, offerUpdateMany } = makeDb(expiredOffers);
    const stubs = makeStubs(emailLog);

    const handler = new ExpireOffersHandler(
      db as never,
      stubs.notificationsService as never,
      stubs.dealEventService as never,
    );

    await handler.handle([]);

    // Verify the findMany was called with the correct WHERE clause
    expect(db.offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SENT',
          expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );

    // Only the SENT expired offer was updated
    expect(offerUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['offer-sent-expired'] } },
        data: { status: 'EXPIRED' },
      }),
    );
  });

  it('transaction wraps both offer and recipient updates together', async () => {
    const expiredOffers = [makeSentOffer('offer-tx', new Date(NOW.getTime() - 1000))];
    const emailLog: string[] = [];
    const { db } = makeDb(expiredOffers);
    const stubs = makeStubs(emailLog);

    const handler = new ExpireOffersHandler(
      db as never,
      stubs.notificationsService as never,
      stubs.dealEventService as never,
    );

    await handler.handle([]);

    // $transaction was called once (wrapping both updateMany calls)
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    // The transaction received an array of two operations
    const transactionArg = (db.$transaction as jest.Mock).mock.calls[0][0] as unknown[];
    expect(Array.isArray(transactionArg)).toBe(true);
    expect(transactionArg).toHaveLength(2);
  });
});
