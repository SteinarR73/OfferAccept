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

// ─── Session binding tests ────────────────────────────────────────────────────
//
// Verifies that accept() and verifyOtp() derive the authoritative session from
// the challenge's bound sessionId — never from "latest resumable".
//
// Key invariants:
//   - accept() requires challenge.status === VERIFIED
//   - accept() requires challenge.recipientId === token recipient's id
//   - accept() uses challenge.sessionId as the session source (not findResumable)
//   - A VERIFIED challenge from session A cannot advance session B
//   - Multi-tab: two concurrent challenges — each is bound to its own session

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

const RECIPIENT_ID = 'recipient-binding-1';
const SESSION_A_ID = 'session-binding-A';
const SESSION_B_ID = 'session-binding-B';
const CHALLENGE_A_ID = 'challenge-binding-A';
const CHALLENGE_B_ID = 'challenge-binding-B';
const OFFER_ID = 'offer-binding-1';
const SNAPSHOT_ID = 'snap-binding-1';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRecipient(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPIENT_ID,
    offerId: OFFER_ID,
    email: 'recipient@example.com',
    name: 'Jane Smith',
    status: 'OTP_VERIFIED',
    tokenHash: 'irrelevant-for-unit-test',
    tokenInvalidatedAt: null,
    ...overrides,
  };
}

function makeChallenge(overrides: Record<string, unknown> = {}) {
  return {
    id: CHALLENGE_A_ID,
    sessionId: SESSION_A_ID,
    recipientId: RECIPIENT_ID,
    status: 'VERIFIED',
    verifiedAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  };
}

function makeSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    recipientId: RECIPIENT_ID,
    offerId: OFFER_ID,
    snapshotId: SNAPSHOT_ID,
    status: 'OTP_VERIFIED',
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    ...overrides,
  };
}

// ─── Test module setup ────────────────────────────────────────────────────────

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

function makeMockTokenService(recipient: ReturnType<typeof makeRecipient>) {
  return {
    verifyToken: jest.fn<() => Promise<typeof recipient>>().mockResolvedValue(recipient),
  };
}

function makeMockSessionService() {
  return {
    getAndValidate: jest.fn(),
    findResumable: jest.fn(),
    create: jest.fn(),
  };
}

function makeMockOtpService() {
  return {
    verifyAndAdvanceSession: jest.fn(),
    issue: jest.fn(),
  };
}

function makeMockAcceptanceService() {
  return {
    accept: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      acceptanceRecord: { id: 'acceptance-1', acceptedAt: new Date() },
      senderEmail: 'sender@example.com',
      senderName: 'Acme Corp',
      offerTitle: 'Test Offer',
      recipientName: 'Jane Smith',
      recipientEmail: 'recipient@example.com',
    }),
    decline: jest.fn(),
  };
}

async function buildService(
  db: MockDb,
  tokenService: ReturnType<typeof makeMockTokenService>,
  sessionService: ReturnType<typeof makeMockSessionService>,
  otpService: ReturnType<typeof makeMockOtpService>,
  acceptanceService: ReturnType<typeof makeMockAcceptanceService>,
) {
  const module = await Test.createTestingModule({
    providers: [
      SigningFlowService,
      { provide: 'PRISMA', useValue: db },
      { provide: SigningTokenService, useValue: tokenService },
      { provide: SigningSessionService, useValue: sessionService },
      { provide: SigningOtpService, useValue: otpService },
      { provide: AcceptanceService, useValue: acceptanceService },
      {
        provide: SigningEventService,
        useValue: { append: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
      },
      {
        provide: CertificateService,
        useValue: {
          generateForAcceptance: jest
            .fn<() => Promise<{ certificateId: string }>>()
            .mockResolvedValue({ certificateId: 'cert-1' }),
        },
      },
      {
        provide: EMAIL_PORT,
        useValue: {
          sendAcceptanceConfirmationToSender: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
          sendAcceptanceConfirmationToRecipient: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
          sendDeclineNotification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
      },
    ],
  }).compile();

  return module.get(SigningFlowService);
}

// ─── accept() — session derived from VERIFIED challenge ───────────────────────

describe('SigningFlowService.accept() — challenge-bound session derivation', () => {
  it('accepts using the session bound to the verified challenge', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();
    const otpSvc = makeMockOtpService();
    const acceptSvc = makeMockAcceptanceService();

    const verifiedChallenge = makeChallenge({ id: CHALLENGE_A_ID, sessionId: SESSION_A_ID });
    const sessionA = makeSession(SESSION_A_ID);

    db.signingOtpChallenge.findUnique.mockResolvedValue(verifiedChallenge as never);
    sessionSvc.getAndValidate.mockResolvedValue(sessionA as never);

    const service = await buildService(db, tokenSvc, sessionSvc, otpSvc, acceptSvc);

    await expect(
      service.accept('raw-token', CHALLENGE_A_ID, { ipAddress: '1.2.3.4' }),
    ).resolves.toBeDefined();

    // getAndValidate must be called with the challenge's bound sessionId
    expect(sessionSvc.getAndValidate).toHaveBeenCalledWith(SESSION_A_ID);
  });

  it('throws OtpChallengeMismatchError when challenge does not exist', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();

    db.signingOtpChallenge.findUnique.mockResolvedValue(null as never);

    const service = await buildService(db, tokenSvc, sessionSvc, makeMockOtpService(), makeMockAcceptanceService());

    await expect(
      service.accept('raw-token', CHALLENGE_A_ID, {}),
    ).rejects.toThrow(OtpChallengeMismatchError);

    // Session is never consulted — mismatch is detected before DB query for session
    expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge.recipientId does not match token recipient', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();

    // Challenge belongs to a different recipient
    const foreignChallenge = makeChallenge({ recipientId: 'other-recipient-id' });
    db.signingOtpChallenge.findUnique.mockResolvedValue(foreignChallenge as never);

    const service = await buildService(db, tokenSvc, sessionSvc, makeMockOtpService(), makeMockAcceptanceService());

    await expect(
      service.accept('raw-token', CHALLENGE_A_ID, {}),
    ).rejects.toThrow(OtpChallengeMismatchError);

    expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge is PENDING (OTP not yet verified)', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();

    // Challenge exists but was not verified yet — status still PENDING
    const pendingChallenge = makeChallenge({ status: 'PENDING', verifiedAt: null });
    db.signingOtpChallenge.findUnique.mockResolvedValue(pendingChallenge as never);

    const service = await buildService(db, tokenSvc, sessionSvc, makeMockOtpService(), makeMockAcceptanceService());

    await expect(
      service.accept('raw-token', CHALLENGE_A_ID, {}),
    ).rejects.toThrow(OtpChallengeMismatchError);

    expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge is EXPIRED (not VERIFIED)', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();

    const expiredChallenge = makeChallenge({ status: 'EXPIRED' });
    db.signingOtpChallenge.findUnique.mockResolvedValue(expiredChallenge as never);

    const service = await buildService(db, tokenSvc, sessionSvc, makeMockOtpService(), makeMockAcceptanceService());

    await expect(
      service.accept('raw-token', CHALLENGE_A_ID, {}),
    ).rejects.toThrow(OtpChallengeMismatchError);

    expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
  });

  it('propagates SessionExpiredError when bound session is expired', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();

    const verifiedChallenge = makeChallenge({ sessionId: SESSION_A_ID });
    db.signingOtpChallenge.findUnique.mockResolvedValue(verifiedChallenge as never);
    // getAndValidate throws SessionExpiredError for expired/terminal sessions
    sessionSvc.getAndValidate.mockRejectedValue(new SessionExpiredError() as never);

    const service = await buildService(db, tokenSvc, sessionSvc, makeMockOtpService(), makeMockAcceptanceService());

    await expect(
      service.accept('raw-token', CHALLENGE_A_ID, {}),
    ).rejects.toThrow(SessionExpiredError);
  });
});

// ─── Multi-session / multi-tab binding ────────────────────────────────────────

describe('SigningFlowService.accept() — multi-session binding isolation', () => {
  it('uses session A when challenge A is verified, even if session B is newer', async () => {
    // Scenario: recipient has two sessions (e.g. multi-tab).
    // Challenge A is VERIFIED and bound to session A.
    // Session B is the more recent session (would be returned by findResumable).
    // accept() must use session A — not session B.
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();
    const acceptSvc = makeMockAcceptanceService();

    const challengeA = makeChallenge({ id: CHALLENGE_A_ID, sessionId: SESSION_A_ID });
    const sessionA = makeSession(SESSION_A_ID, { status: 'OTP_VERIFIED' });

    db.signingOtpChallenge.findUnique.mockResolvedValue(challengeA as never);
    sessionSvc.getAndValidate.mockResolvedValue(sessionA as never);

    // findResumable would return session B if called — confirm it is NOT called
    const sessionB = makeSession(SESSION_B_ID, { status: 'AWAITING_OTP' });
    sessionSvc.findResumable.mockResolvedValue(sessionB as never);

    const service = await buildService(db, tokenSvc, sessionSvc, makeMockOtpService(), acceptSvc);

    await service.accept('raw-token', CHALLENGE_A_ID, {});

    // Must use session A (from challenge binding), not B (from findResumable)
    expect(sessionSvc.getAndValidate).toHaveBeenCalledWith(SESSION_A_ID);
    expect(sessionSvc.getAndValidate).not.toHaveBeenCalledWith(SESSION_B_ID);
    expect(sessionSvc.findResumable).not.toHaveBeenCalled();
  });

  it('rejects challenge B when presented for accept() with challenge A verified', async () => {
    // Scenario: recipient verified OTP in tab A (challenge A → VERIFIED, session A).
    // Tab B still has challenge B (PENDING, session B). Presenting challenge B to accept()
    // must fail because challenge B is not VERIFIED.
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();

    // Challenge B is PENDING — not yet verified
    const challengeB = makeChallenge({
      id: CHALLENGE_B_ID,
      sessionId: SESSION_B_ID,
      status: 'PENDING',
      verifiedAt: null,
    });
    db.signingOtpChallenge.findUnique.mockResolvedValue(challengeB as never);

    const service = await buildService(db, tokenSvc, sessionSvc, makeMockOtpService(), makeMockAcceptanceService());

    await expect(
      service.accept('raw-token', CHALLENGE_B_ID, {}),
    ).rejects.toThrow(OtpChallengeMismatchError);

    expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
  });
});

// ─── verifyOtp() — challenge-recipient binding ─────────────────────────────────

describe('SigningFlowService.verifyOtp() — challenge-recipient binding', () => {
  it('passes challenge binding down to SigningOtpService.verifyAndAdvanceSession', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();
    const otpSvc = makeMockOtpService();

    const expectedResult = { verified: true, verifiedAt: new Date() };
    otpSvc.verifyAndAdvanceSession.mockResolvedValue(expectedResult as never);

    const service = await buildService(db, tokenSvc, sessionSvc, otpSvc, makeMockAcceptanceService());

    const result = await service.verifyOtp('raw-token', CHALLENGE_A_ID, '654321', {});

    expect(result).toEqual(expectedResult);
    // verifyAndAdvanceSession receives the recipient id from the token — not from caller input
    expect(otpSvc.verifyAndAdvanceSession).toHaveBeenCalledWith(
      CHALLENGE_A_ID,
      RECIPIENT_ID,
      '654321',
      {},
    );
  });

  it('propagates OtpChallengeMismatchError from SigningOtpService when challenge belongs to another recipient', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const sessionSvc = makeMockSessionService();
    const otpSvc = makeMockOtpService();

    // OTP service enforces binding: challenge.recipientId !== recipient.id → mismatch
    otpSvc.verifyAndAdvanceSession.mockRejectedValue(new OtpChallengeMismatchError() as never);

    const service = await buildService(db, tokenSvc, sessionSvc, otpSvc, makeMockAcceptanceService());

    await expect(
      service.verifyOtp('raw-token', 'challenge-from-different-recipient', '654321', {}),
    ).rejects.toThrow(OtpChallengeMismatchError);
  });

  it('propagates SessionExpiredError from SigningOtpService when session is expired', async () => {
    const recipient = makeRecipient();
    const db = createMockDb();
    const tokenSvc = makeMockTokenService(recipient);
    const otpSvc = makeMockOtpService();

    otpSvc.verifyAndAdvanceSession.mockRejectedValue(new SessionExpiredError() as never);

    const service = await buildService(db, tokenSvc, makeMockSessionService(), otpSvc, makeMockAcceptanceService());

    await expect(
      service.verifyOtp('raw-token', CHALLENGE_A_ID, '654321', {}),
    ).rejects.toThrow(SessionExpiredError);
  });
});
