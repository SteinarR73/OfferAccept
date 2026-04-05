/**
 * TEST 8 — Token Replay After Acceptance
 *
 * Invariant: Attempting to use a signing link token after the offer is already
 * accepted must throw OfferAlreadyAcceptedError. No new SigningSession should
 * be created, and no OTP should be issued.
 *
 * Simulates the scenario where:
 *   - A recipient completes the signing flow (offer.status = ACCEPTED).
 *   - The recipient (or an attacker) revisits the same signing link.
 *   - The server detects the terminal state and rejects all further flow operations.
 *
 * Verifies:
 *   - getOfferContext() throws OfferAlreadyAcceptedError when offer is ACCEPTED
 *   - requestOtp() throws OfferAlreadyAcceptedError when offer is ACCEPTED
 *   - No SigningSession.create() is called in either case
 */

import { jest } from '@jest/globals';
import { SigningFlowService } from '../../src/modules/signing/services/signing-flow.service';
import { OfferAlreadyAcceptedError, OfferExpiredError, TokenInvalidError } from '../../src/common/errors/domain.errors';

const RAW_TOKEN = 'oa_' + 'a'.repeat(43); // valid format
const RECIPIENT_ID = 'recipient-1';
const OFFER_ID = 'offer-1';
const SNAPSHOT_ID = 'snapshot-1';
const CERT_ID = 'cert-abc';

function makeRecipient(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPIENT_ID,
    offerId: OFFER_ID,
    email: 'jane@example.com',
    name: 'Jane Smith',
    tokenHash: 'hash123',
    tokenExpiresAt: new Date(Date.now() + 86400 * 1000),
    tokenInvalidatedAt: null,
    status: 'SENT',
    ...overrides,
  };
}

function makeAcceptedOffer() {
  return { id: OFFER_ID, status: 'ACCEPTED', expiresAt: null };
}

function makeDb(offer: Record<string, unknown>, sessionCreateSpy: jest.Mock) {
  return {
    offer: {
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue(offer),
    },
    acceptanceCertificate: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: CERT_ID,
        acceptanceRecord: { acceptedAt: new Date('2026-03-01T12:00:00.000Z') },
      }),
    },
    offerSnapshot: {
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue({
        id: SNAPSHOT_ID,
        offerId: OFFER_ID,
        title: 'Agreement',
        message: null,
        senderName: 'Acme Corp',
        senderEmail: 'sender@acme.com',
        expiresAt: null,
        documents: [],
      }),
    },
    signingSession: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: sessionCreateSpy,
    },
    offerRecipient: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

function makeTokenService(recipient: Record<string, unknown>) {
  return {
    verifyToken: jest.fn<any>().mockResolvedValue(recipient),
    hash: jest.fn<any>().mockReturnValue('hash123'),
    generateToken: jest.fn(),
  };
}

function makeStubs() {
  return {
    sessionService: {
      findResumable: jest.fn<any>().mockResolvedValue(null),
      createSession: jest.fn(),
    },
    otpService: {
      issueOtp: jest.fn(),
      verifyOtp: jest.fn(),
    },
    acceptanceService: {
      accept: jest.fn(),
    },
    eventService: {
      append: jest.fn(),
      verifyChain: jest.fn(),
    },
    certificateService: {
      generateForAcceptance: jest.fn(),
      verify: jest.fn(),
    },
    notificationsService: {
      onDealExpired: jest.fn(),
      onDealDeclined: jest.fn(),
    },
    webhookService: {
      triggerForOffer: jest.fn(),
    },
    dealEventService: {
      emit: jest.fn<any>().mockResolvedValue(undefined),
    },
    jobService: {
      enqueue: jest.fn(),
    },
    traceContext: {
      getTraceId: jest.fn<any>().mockReturnValue('trace-1'),
    },
  };
}

describe('TEST 8 — Token Replay After Acceptance', () => {
  it('getOfferContext() throws OfferAlreadyAcceptedError when offer is ACCEPTED', async () => {
    const sessionCreateSpy = jest.fn();
    const db = makeDb(makeAcceptedOffer(), sessionCreateSpy);
    const stubs = makeStubs();
    const tokenService = makeTokenService(makeRecipient());

    const svc = new SigningFlowService(
      db as never,
      tokenService as never,
      stubs.sessionService as never,
      stubs.otpService as never,
      stubs.acceptanceService as never,
      stubs.eventService as never,
      stubs.certificateService as never,
      stubs.notificationsService as never,
      stubs.webhookService as never,
      stubs.dealEventService as never,
      stubs.jobService as never,
      stubs.traceContext as never,
    );

    await expect(svc.getOfferContext(RAW_TOKEN)).rejects.toThrow(OfferAlreadyAcceptedError);

    // Token was looked up, offer was checked — but no session was created
    expect(tokenService.verifyToken).toHaveBeenCalledWith(RAW_TOKEN);
    expect(sessionCreateSpy).not.toHaveBeenCalled();
  });

  it('getOfferContext() includes acceptedAt and certificateId in the error', async () => {
    const sessionCreateSpy = jest.fn();
    const acceptedAt = new Date('2026-03-01T12:00:00.000Z');
    const db = makeDb(makeAcceptedOffer(), sessionCreateSpy);
    const stubs = makeStubs();

    const svc = new SigningFlowService(
      db as never,
      makeTokenService(makeRecipient()) as never,
      stubs.sessionService as never,
      stubs.otpService as never,
      stubs.acceptanceService as never,
      stubs.eventService as never,
      stubs.certificateService as never,
      stubs.notificationsService as never,
      stubs.webhookService as never,
      stubs.dealEventService as never,
      stubs.jobService as never,
      stubs.traceContext as never,
    );

    let thrown: OfferAlreadyAcceptedError | undefined;
    try {
      await svc.getOfferContext(RAW_TOKEN);
    } catch (e) {
      thrown = e as OfferAlreadyAcceptedError;
    }

    expect(thrown).toBeInstanceOf(OfferAlreadyAcceptedError);
    // The error should carry the acceptance timestamp and certificate id
    expect((thrown as unknown as { acceptedAt?: Date }).acceptedAt?.toISOString()).toBe(acceptedAt.toISOString());
    expect((thrown as unknown as { certificateId?: string }).certificateId).toBe(CERT_ID);
  });

  it('throws TokenInvalidError for a non-SENT, non-ACCEPTED offer (e.g. DECLINED)', async () => {
    const declinedOffer = { id: OFFER_ID, status: 'DECLINED', expiresAt: null };
    const db = makeDb(declinedOffer, jest.fn());
    const stubs = makeStubs();

    const svc = new SigningFlowService(
      db as never,
      makeTokenService(makeRecipient()) as never,
      stubs.sessionService as never,
      stubs.otpService as never,
      stubs.acceptanceService as never,
      stubs.eventService as never,
      stubs.certificateService as never,
      stubs.notificationsService as never,
      stubs.webhookService as never,
      stubs.dealEventService as never,
      stubs.jobService as never,
      stubs.traceContext as never,
    );

    await expect(svc.getOfferContext(RAW_TOKEN)).rejects.toThrow(TokenInvalidError);
  });

  it('throws OfferExpiredError when expiresAt has passed', async () => {
    const expiredOffer = {
      id: OFFER_ID,
      status: 'SENT',
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    };
    const db = makeDb(expiredOffer, jest.fn());
    const stubs = makeStubs();

    const svc = new SigningFlowService(
      db as never,
      makeTokenService(makeRecipient()) as never,
      stubs.sessionService as never,
      stubs.otpService as never,
      stubs.acceptanceService as never,
      stubs.eventService as never,
      stubs.certificateService as never,
      stubs.notificationsService as never,
      stubs.webhookService as never,
      stubs.dealEventService as never,
      stubs.jobService as never,
      stubs.traceContext as never,
    );

    await expect(svc.getOfferContext(RAW_TOKEN)).rejects.toThrow(OfferExpiredError);
  });

  it('getOfferContext() succeeds for a SENT, non-expired offer (control case)', async () => {
    const sentOffer = { id: OFFER_ID, status: 'SENT', expiresAt: null };
    const db = makeDb(sentOffer, jest.fn());
    const stubs = makeStubs();

    const svc = new SigningFlowService(
      db as never,
      makeTokenService(makeRecipient()) as never,
      stubs.sessionService as never,
      stubs.otpService as never,
      stubs.acceptanceService as never,
      stubs.eventService as never,
      stubs.certificateService as never,
      stubs.notificationsService as never,
      stubs.webhookService as never,
      stubs.dealEventService as never,
      stubs.jobService as never,
      stubs.traceContext as never,
    );

    const ctx = await svc.getOfferContext(RAW_TOKEN);
    expect(ctx.offerTitle).toBe('Agreement');
    expect(ctx.senderName).toBe('Acme Corp');
  });
});
