import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  OtpChallengeMismatchError,
  SessionExpiredError,
} from '../../src/common/errors/domain.errors';
import { SigningDecisionOrchestrator } from '../../src/modules/signing/services/signing-decision.orchestrator';
import { SigningTokenService } from '../../src/modules/signing/services/signing-token.service';
import { SigningSessionService } from '../../src/modules/signing/services/signing-session.service';
import { AcceptanceService } from '../../src/modules/signing/services/acceptance.service';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { WebhookService } from '../../src/modules/enterprise/webhook.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import { JobService } from '../../src/modules/jobs/job.service';
import { TraceContext } from '../../src/common/trace/trace.context';

// ─── Session-bound decline tests ───────────────────────────────────────────────

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
    reminderSchedule: { deleteMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }) },
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
      SigningDecisionOrchestrator,
      { provide: 'PRISMA', useValue: db },
      { provide: SigningTokenService, useValue: tokenSvc },
      { provide: SigningSessionService, useValue: sessionSvc },
      { provide: AcceptanceService, useValue: acceptanceSvc },
      { provide: CertificateService, useValue: { generateForAcceptance: jest.fn() } },
      { provide: NotificationsService, useValue: { onDealAccepted: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), onDealDeclined: jest.fn<() => Promise<void>>().mockResolvedValue(undefined), onDealExpired: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
      { provide: WebhookService, useValue: { dispatchEvent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
      { provide: DealEventService, useValue: { emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) } },
      { provide: JobService, useValue: { send: jest.fn<() => Promise<string>>().mockResolvedValue('job-1'), sendOnce: jest.fn<() => Promise<string | null>>().mockResolvedValue('job-1') } },
      { provide: TraceContext, useValue: { get: jest.fn<() => string | undefined>().mockReturnValue(undefined), run: jest.fn((_, fn: () => unknown) => fn()) } },
    ],
  }).compile();

  return module.get(SigningDecisionOrchestrator);
}

describe('SigningDecisionOrchestrator.decline() — challenge-bound session', () => {
  // Declining carries the same email-verification assurance as accepting: only a VERIFIED
  // challenge is accepted (the session state machine allows only OTP_VERIFIED → DECLINED).
  it.each(['PENDING', 'LOCKED', 'EXPIRED', 'INVALIDATED'])(
    'rejects a %s challenge without touching the session or the offer',
    async (status) => {
      const db = createMockDb();
      const tokenSvc = { verifyToken: jest.fn<() => Promise<ReturnType<typeof makeRecipient>>>().mockResolvedValue(makeRecipient()) };
      const sessionSvc = { getAndValidate: jest.fn(), findResumable: jest.fn(), create: jest.fn() };
      const acceptanceSvc = { decline: jest.fn() };

      db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge({ status }) as never);

      const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

      await expect(service.decline('raw-token', CHALLENGE_ID, {})).rejects.toThrow(OtpChallengeMismatchError);
      expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
      expect(sessionSvc.create).not.toHaveBeenCalled();
      expect(acceptanceSvc.decline).not.toHaveBeenCalled();
    },
  );

  it('resolves session from challenge.sessionId for a VERIFIED challenge', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn<() => Promise<ReturnType<typeof makeRecipient>>>().mockResolvedValue(makeRecipient()) };
    const sessionSvc = {
      getAndValidate: jest.fn<() => Promise<ReturnType<typeof makeSession>>>().mockResolvedValue(makeSession()),
      findResumable: jest.fn(),
      create: jest.fn(),
    };
    const acceptanceSvc = { decline: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };

    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge({ status: 'VERIFIED' }) as never);

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await service.decline('raw-token', CHALLENGE_ID, {});

    expect(sessionSvc.getAndValidate).toHaveBeenCalledWith(SESSION_ID);
    expect(sessionSvc.findResumable).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge does not exist', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn<() => Promise<ReturnType<typeof makeRecipient>>>().mockResolvedValue(makeRecipient()) };
    const sessionSvc = { getAndValidate: jest.fn(), findResumable: jest.fn(), create: jest.fn() };
    const acceptanceSvc = { decline: jest.fn() };

    db.signingOtpChallenge.findUnique.mockResolvedValue(null as never);

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await expect(service.decline('raw-token', CHALLENGE_ID, {})).rejects.toThrow(OtpChallengeMismatchError);
    expect(sessionSvc.getAndValidate).not.toHaveBeenCalled();
  });

  it('throws OtpChallengeMismatchError when challenge belongs to a different recipient', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn<() => Promise<ReturnType<typeof makeRecipient>>>().mockResolvedValue(makeRecipient()) };
    const sessionSvc = { getAndValidate: jest.fn(), findResumable: jest.fn(), create: jest.fn() };
    const acceptanceSvc = { decline: jest.fn() };

    db.signingOtpChallenge.findUnique.mockResolvedValue(
      makeChallenge({ status: 'VERIFIED', recipientId: 'other-recipient' }) as never,
    );

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await expect(service.decline('raw-token', CHALLENGE_ID, {})).rejects.toThrow(OtpChallengeMismatchError);
  });

  it('propagates SessionExpiredError when bound session is expired', async () => {
    const db = createMockDb();
    const tokenSvc = { verifyToken: jest.fn<() => Promise<ReturnType<typeof makeRecipient>>>().mockResolvedValue(makeRecipient()) };
    const sessionSvc = {
      getAndValidate: jest.fn<(...args: any[]) => any>().mockRejectedValue(new SessionExpiredError()),
      findResumable: jest.fn(),
      create: jest.fn(),
    };
    const acceptanceSvc = { decline: jest.fn() };

    db.signingOtpChallenge.findUnique.mockResolvedValue(makeChallenge({ status: 'VERIFIED' }) as never);

    const service = await buildService(db, tokenSvc, sessionSvc, acceptanceSvc);

    await expect(service.decline('raw-token', CHALLENGE_ID, {})).rejects.toThrow(SessionExpiredError);
  });
});

// ─── Request validation ────────────────────────────────────────────────────────

describe('DeclineOfferDto', () => {
  it('requires a challengeId (declining before email verification is not supported)', async () => {
    const { validate } = await import('class-validator');
    const { DeclineOfferDto } = await import('../../src/modules/signing/dto/decline-offer.dto');

    const missing = await validate(Object.assign(new DeclineOfferDto(), {}));
    expect(missing.map((e) => e.property)).toContain('challengeId');

    const empty = await validate(Object.assign(new DeclineOfferDto(), { challengeId: '' }));
    expect(empty.map((e) => e.property)).toContain('challengeId');

    const ok = await validate(Object.assign(new DeclineOfferDto(), { challengeId: 'c-1' }));
    expect(ok).toHaveLength(0);
  });
});
