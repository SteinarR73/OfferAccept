import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  OtpChallengeMismatchError,
  SessionExpiredError,
} from '../../src/common/errors/domain.errors';
import { SigningFlowService } from '../../src/modules/signing/services/signing-flow.service';
import { SigningTokenService } from '../../src/modules/signing/services/signing-token.service';
import { SigningSessionService } from '../../src/modules/signing/services/signing-session.service';
import { SigningOtpService } from '../../src/modules/signing/services/signing-otp.service';
import { AcceptanceService } from '../../src/modules/signing/services/acceptance.service';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { EMAIL_PORT } from '../../src/common/email/email.port';

// ─── Session-bound decline tests ───────────────────────────────────────────────
//
// Verifies that decline() resolves the session from the challenge's bound
// sessionId instead of a "latest resumable" lookup.
//
// The challenge does NOT need to be VERIFIED — it only needs to exist and belong
// to the correct recipient. This lets the recipient decline before completing OTP.

const RECIPIENT_ID = 'recipient-decline-1';
const SESSION_ID = 'session-decline-1';
const CHALLENGE_ID = 'challenge-decline-1';
const OFFER_ID = 'offer-decline-1';

function makeRecipient() {
  return { id: RECIPIENT_ID, offerId: OFFER_ID, email: 'r@example.com', name: 'Jane' };
}

function makeChallenge(overrides: Record<string, unknown> = {}) {
  return {
    id: CHALLENGE_ID,
    sessionId: SESSION_ID,
    recipientId: RECIPIENT_ID,
    status: 'PENDING',
    ...overrides,
  };
}

function makeSession() {
  return {
    id: SESSION_ID,
    recipientId: RECIPIENT_ID,
    offerId: OFFER_ID,
    snapshotId: 'snap-1',
    status: 'AWAITING_OTP',
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
  };
}

function createMockDb() {
  return {
    signingOtpChallenge: { findUnique: jest.fn() },
    offerRecipient: { findFirst: jest.fn(), update: jest.fn() },
    offer: { findUniqueOrThrow: jest.fn() },
    offerSnapshot: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(),
  };
}

type MockDb = ReturnType<typeof createMockDb>;

async function buildService(
  db: MockDb,
  tokenSvc: { verifyToken: ReturnType<typeof jest.fn> },
  sessionSvc: { getAndValidate: ReturnType<typeof jest.fn>; findResumable: ReturnType<typeof jest.fn>; create: ReturnType<typeof jest.fn> },
  acceptanceSvc: { decline: ReturnType<typeof jest.fn> },
) {
  const module = await Test.createTestingModule({
    providers: [
      SigningFlowService,
      { provide: 'PRISMA', useValue: db },
      { provide: SigningTokenService, useValue: tokenSvc },
      { provide: SigningSessionService, useValue: sessionSvc },
      { provide: SigningOtpService, useValue: { verifyAndAdvanceSession: jest.fn(), issue: jest.fn() } },
      { provide: AcceptanceService, useValue: acceptanceSvc },
      { provide: SigningEventService, useValue: { append: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
      { provide: CertificateService, useValue: { generateForAcceptance: jest.fn() } },
      { provide: EMAIL_PORT, useValue: { sendDeclineNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
    ],
  }).compile();

  return module.get(SigningFlowService);
}

describe('SigningFlowService.decline() — challenge-bound session', () => {
  it('resolves session from challenge.sessionId for a PENDING challenge', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn().mockResolvedValue(makeRecipient()) };
    const sessionSvc = {
      getAndValidate: jest.fn().mockResolvedValue(makeSession()),
      findResumable: jest.fn(),
      create: jest.fn(),
    };
    const acceptanceSvc = { decline: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };

    // PENDING challenge — not yet verified
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge({ status: 'PENDING' }) as never);
    db.offerSnapshot.findUniqueOrThrow.mockRejectedValue(new Error('should not be called') as never);

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await service.decline('raw-token', CHALLENGE_ID, {});

    // Must use challenge.sessionId via getAndValidate — NOT findResumable
    expect(sessionSvc.getAndValidate).toHaveBeenCalledWith(SESSION_ID);
    expect(sessionSvc.findResumable).not.toHaveBeenCalled();
    expect(acceptanceSvc.decline).toHaveBeenCalledTimes(1);
  });

  it('resolves session from challenge.sessionId for a VERIFIED challenge', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn().mockResolvedValue(makeRecipient()) };
    const sessionSvc = {
      getAndValidate: jest.fn().mockResolvedValue(makeSession()),
      findResumable: jest.fn(),
      create: jest.fn(),
    };
    const acceptanceSvc = { decline: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };

    // VERIFIED challenge — OTP already verified
    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge({ status: 'VERIFIED' }) as never);

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await service.decline('raw-token', CHALLENGE_ID, {});

    expect(sessionSvc.getAndValidate).toHaveBeenCalledWith(SESSION_ID);
    expect(sessionSvc.findResumable).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge does not exist', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn().mockResolvedValue(makeRecipient()) };
    const sessionSvc = { getAndValidate: jest.fn(), findResumable: jest.fn(), create: jest.fn() };
    const acceptanceSvc = { decline: jest.fn() };

    db.signingOtpChallenge.findUnique.mockResolvedValue(null as never);

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await expect(service.decline('raw-token', CHALLENGE_ID, {})).rejects.toThrow(OtpChallengeMismatchError);
    expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge belongs to a different recipient', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn().mockResolvedValue(makeRecipient()) };
    const sessionSvc = { getAndValidate: jest.fn(), findResumable: jest.fn(), create: jest.fn() };
    const acceptanceSvc = { decline: jest.fn() };

    db.signingOtpChallenge.findUnique.mockResolvedValue(
      makeChallenge({ recipientId: 'other-recipient' }) as never,
    );

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await expect(service.decline('raw-token', CHALLENGE_ID, {})).rejects.toThrow(OtpChallengeMismatchError);
  });

  it('propagates SessionExpiredError when bound session is expired', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn().mockResolvedValue(makeRecipient()) };
    const sessionSvc = {
      getAndValidate: jest.fn().mockRejectedValue(new SessionExpiredError() as never),
      findResumable: jest.fn(),
      create: jest.fn(),
    };
    const acceptanceSvc = { decline: jest.fn() };

    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge() as never);

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await expect(service.decline('raw-token', CHALLENGE_ID, {})).rejects.toThrow(SessionExpiredError);
  });
});
