import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigModule } from '@nestjs/config';
import { jest } from '@jest/globals';
import { SigningModule } from '../../src/modules/signing/signing.module';
import { RateLimitModule } from '../../src/common/rate-limit/rate-limit.module';
import { EmailModule } from '../../src/common/email/email.module';
import { DevEmailAdapter } from '../../src/common/email/dev-email.adapter';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import {
  createMockDb,
  makeRecipient,
  makeOffer,
  makeSnapshot,
  makeSession,
  makeChallenge,
  makeAcceptanceRecord,
  VALID_RAW_TOKEN,
  MockDb,
} from './mock-db';

// ─── Helper ────────────────────────────────────────────────────────────────────
function hashCode(code: string) {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('Public Signing Flow (e2e)', () => {
  let app: INestApplication;
  let db: MockDb;
  let emailAdapter: DevEmailAdapter;

  beforeEach(async () => {
    db = createMockDb();

    // Default signingEvent.create to succeed (used by all flow steps)
    db.signingEvent.create.mockResolvedValue({ id: 'event-1', sequenceNumber: 1, eventHash: 'h1', previousEventHash: null } as never);
    db.signingEvent.findFirst.mockResolvedValue(null as never);

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        RateLimitModule,
        EmailModule,
        SigningModule,
      ],
    })
      .overrideProvider('PRISMA')
      .useValue(db)
      // CertificateService is tested separately — mock it here to isolate
      // signing flow tests from the full certificate generation DB queries.
      .overrideProvider(CertificateService)
      .useValue({ generateForAcceptance: jest.fn<() => Promise<{ certificateId: string }>>().mockResolvedValue({ certificateId: 'cert-mock-1' }) })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    emailAdapter = module.get(DevEmailAdapter);
    emailAdapter.reset();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── GET /signing/:token ──────────────────────────────────────────────────────

  describe('GET /api/v1/signing/:token — getContext', () => {
    it('returns offer context for a valid token', async () => {
      db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
      db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
      db.signingSession.findFirst.mockResolvedValue(null as never);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
        .expect(200);

      expect(res.body).toMatchObject({
        offerTitle: 'Software Development Agreement',
        senderName: 'Acme Corp',
        recipientName: 'Jane Smith',
        documents: [],
        acceptanceStatement: expect.stringContaining('Jane Smith'),
      });
    });

    it('returns 404 for an invalid token (same response as expired)', async () => {
      db.offerRecipient.findFirst.mockResolvedValue(null as never);

      const res = await request(app.getHttpServer())
        .get('/api/v1/signing/oa_invalid_token')
        .expect(404);

      expect(res.body.code).toBe('TOKEN_INVALID');
    });

    it('returns 404 when offer is in a non-SENT state', async () => {
      db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer({ status: 'REVOKED' }) as never);

      await request(app.getHttpServer())
        .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
        .expect(404);
    });

    it('returns 410 when offer has passed its expiry date', async () => {
      db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(
        makeOffer({ expiresAt: new Date(Date.now() - 1000) }) as never,
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
        .expect(410);

      expect(res.body.code).toBe('OFFER_EXPIRED');
    });

    it('does NOT send an OTP when the context is fetched', async () => {
      db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
      db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
      db.signingSession.findFirst.mockResolvedValue(null as never);

      await request(app.getHttpServer())
        .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
        .expect(200);

      // Critical: no email must have been sent on a GET request
      expect(emailAdapter.getAllSent()).toHaveLength(0);
    });
  });

  // ── POST /signing/:token/otp ──────────────────────────────────────────────────

  describe('POST /api/v1/signing/:token/otp — requestOtp', () => {
    it('creates a session and issues an OTP when the recipient explicitly requests it', async () => {
      const recipient = makeRecipient();
      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.offerRecipient.findUniqueOrThrow.mockResolvedValue(recipient as never);
      db.offerRecipient.update.mockResolvedValue({ ...recipient, status: 'VIEWED' } as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
      db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
      db.signingSession.findFirst.mockResolvedValue(null as never); // no existing session
      db.signingSession.create.mockResolvedValue(makeSession() as never);
      db.signingOtpChallenge.updateMany.mockResolvedValue({ count: 0 } as never);
      db.signingOtpChallenge.create.mockResolvedValue(makeChallenge() as never);
      db.signingOtpChallenge.findFirst.mockResolvedValue(makeChallenge() as never);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp`)
        .expect(200);

      expect(res.body).toMatchObject({
        challengeId: expect.any(String),
        deliveryAddressMasked: expect.stringMatching(/ja\*+@example\.com/),
        expiresAt: expect.any(String),
      });

      // Email must have been sent
      expect(emailAdapter.getAllSent()).toHaveLength(1);
      expect(emailAdapter.getAllSent()[0].to).toBe('jane@example.com');
    });

    it('resumes an existing session if one is still active', async () => {
      const recipient = makeRecipient({ status: 'VIEWED' });
      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
      db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
      db.signingSession.findFirst.mockResolvedValue(makeSession() as never); // existing session
      db.signingOtpChallenge.updateMany.mockResolvedValue({ count: 0 } as never);
      db.signingOtpChallenge.create.mockResolvedValue(makeChallenge() as never);
      db.signingOtpChallenge.findFirst.mockResolvedValue(makeChallenge() as never);

      await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp`)
        .expect(200);

      // Session.create should NOT have been called (reusing existing session)
      expect(db.signingSession.create).not.toHaveBeenCalled();
    });
  });

  // ── POST /signing/:token/otp/verify ────────────────────────────────────────

  describe('POST /api/v1/signing/:token/otp/verify — verifyOtp', () => {
    const CORRECT_CODE = '123456';

    function setupForVerify(challengeOverrides: Record<string, unknown> = {}) {
      const recipient = makeRecipient({ status: 'VIEWED' });
      const session = makeSession();
      const challenge = makeChallenge({
        codeHash: hashCode(CORRECT_CODE),
        ...challengeOverrides,
      });

      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.signingSession.findFirst.mockResolvedValue(session as never);
      db.signingOtpChallenge.findUnique.mockResolvedValue(challenge as never);
      db.signingOtpChallenge.update.mockResolvedValue({ ...challenge, status: 'VERIFIED', verifiedAt: new Date() } as never);
      db.signingSession.update.mockResolvedValue({ ...session, status: 'OTP_VERIFIED' } as never);
      db.offerRecipient.update.mockResolvedValue({ ...recipient, status: 'OTP_VERIFIED' } as never);

      return { recipient, session, challenge };
    }

    it('verifies a correct OTP code and advances session to OTP_VERIFIED', async () => {
      setupForVerify();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp/verify`)
        .send({ challengeId: 'challenge-1', code: CORRECT_CODE })
        .expect(200);

      expect(res.body).toMatchObject({ verified: true, verifiedAt: expect.any(String) });
      expect(db.signingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OTP_VERIFIED' }) }),
      );
    });

    it('rejects a wrong OTP code with 400 and remaining attempts', async () => {
      setupForVerify({ attemptCount: 0 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp/verify`)
        .send({ challengeId: 'challenge-1', code: '000000' })
        .expect(400);

      expect(res.body.code).toBe('OTP_INVALID');
      expect(res.body.detail?.attemptsRemaining).toBe(4);
    });

    it('locks the challenge after maxAttempts wrong codes', async () => {
      // 4 attempts already used, this is the 5th (= maxAttempts = lockout)
      setupForVerify({ attemptCount: 4 });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp/verify`)
        .send({ challengeId: 'challenge-1', code: '000000' })
        .expect(400);

      expect(res.body.code).toBe('OTP_LOCKED');
    });

    it('rejects reuse of an already-verified challenge with 422', async () => {
      setupForVerify({ status: 'VERIFIED', verifiedAt: new Date() });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp/verify`)
        .send({ challengeId: 'challenge-1', code: CORRECT_CODE })
        .expect(422);

      expect(res.body.code).toBe('OTP_ALREADY_VERIFIED');
    });

    it('rejects an expired challenge with 400', async () => {
      setupForVerify({ expiresAt: new Date(Date.now() - 1000) }); // already expired

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp/verify`)
        .send({ challengeId: 'challenge-1', code: CORRECT_CODE })
        .expect(400);

      expect(res.body.code).toBe('OTP_EXPIRED');
    });

    it('validates that code is exactly 6 numeric digits', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp/verify`)
        .send({ challengeId: 'challenge-1', code: 'abc123' })
        .expect(400);

      // ValidationPipe error — not a domain error
      expect(res.body.message).toBeDefined();
    });
  });

  // ── POST /signing/:token/accept ────────────────────────────────────────────

  describe('POST /api/v1/signing/:token/accept — accept', () => {
    function setupForAccept() {
      const recipient = makeRecipient({ status: 'OTP_VERIFIED' });
      const session = makeSession({ status: 'OTP_VERIFIED', otpVerifiedAt: new Date() });
      const challenge = makeChallenge({
        status: 'VERIFIED',
        verifiedAt: new Date(),
        codeHash: hashCode('123456'),
      });
      const record = makeAcceptanceRecord();

      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.offerRecipient.findUniqueOrThrow.mockResolvedValue(recipient as never);
      db.signingSession.findFirst.mockResolvedValue(session as never);
      db.signingOtpChallenge.findUnique.mockResolvedValue(challenge as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
      db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
      db.acceptanceRecord.create.mockResolvedValue(record as never);
      db.signingSession.update.mockResolvedValue({ ...session, status: 'ACCEPTED' } as never);
      db.offerRecipient.update.mockResolvedValue({ ...recipient, status: 'ACCEPTED' } as never);
      db.offer.update.mockResolvedValue({ ...makeOffer(), status: 'ACCEPTED' } as never);

      return { recipient, session, challenge, record };
    }

    it('accepts the offer and creates an AcceptanceRecord', async () => {
      setupForAccept();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/accept`)
        .send({ challengeId: 'challenge-1' })
        .expect(200);

      expect(res.body).toMatchObject({
        acceptanceRecordId: 'record-1',
        acceptedAt: expect.any(String),
        certificateId: 'cert-mock-1',
      });

      expect(db.acceptanceRecord.create).toHaveBeenCalled();
      expect(db.offer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACCEPTED' } }),
      );
    });

    it('rejects acceptance when session is still AWAITING_OTP (OTP not verified)', async () => {
      const recipient = makeRecipient({ status: 'VIEWED' });
      const session = makeSession({ status: 'AWAITING_OTP' });

      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.signingSession.findFirst.mockResolvedValue(session as never);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/accept`)
        .send({ challengeId: 'challenge-1' })
        .expect(422);

      expect(res.body.code).toBe('SESSION_NOT_VERIFIED');
    });

    it('rejects a second acceptance attempt when offer is already ACCEPTED', async () => {
      const recipient = makeRecipient({ status: 'OTP_VERIFIED' });
      const session = makeSession({ status: 'OTP_VERIFIED' });
      const challenge = makeChallenge({ status: 'VERIFIED', verifiedAt: new Date() });

      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.offerRecipient.findUniqueOrThrow.mockResolvedValue(recipient as never);
      db.signingSession.findFirst.mockResolvedValue(session as never);
      db.signingOtpChallenge.findUnique.mockResolvedValue(challenge as never);
      // Offer is already ACCEPTED — second attempt
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer({ status: 'ACCEPTED' }) as never);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/accept`)
        .send({ challengeId: 'challenge-1' })
        .expect(410);

      expect(res.body.code).toBe('OFFER_ALREADY_ACCEPTED');
    });

    it('rejects acceptance when session has no active OTP challenge for the provided ID', async () => {
      const recipient = makeRecipient({ status: 'OTP_VERIFIED' });
      const session = makeSession({ status: 'OTP_VERIFIED' });

      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.offerRecipient.findUniqueOrThrow.mockResolvedValue(recipient as never);
      db.signingSession.findFirst.mockResolvedValue(session as never);
      // Challenge belongs to a DIFFERENT session
      db.signingOtpChallenge.findUnique.mockResolvedValue(
        makeChallenge({ sessionId: 'other-session', status: 'VERIFIED', verifiedAt: new Date() }) as never,
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/accept`)
        .send({ challengeId: 'challenge-1' })
        .expect(422);

      expect(res.body.code).toBe('OTP_CHALLENGE_MISMATCH');
    });
  });

  // ── POST /signing/:token/decline ───────────────────────────────────────────

  describe('POST /api/v1/signing/:token/decline — decline', () => {
    it('declines the offer and transitions all entities', async () => {
      const recipient = makeRecipient({ status: 'VIEWED' });
      const session = makeSession({ status: 'AWAITING_OTP' });

      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.offerRecipient.findUniqueOrThrow.mockResolvedValue(recipient as never);
      db.signingSession.findFirst.mockResolvedValue(session as never);
      db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
      db.signingSession.update.mockResolvedValue({ ...session, status: 'DECLINED' } as never);
      db.offerRecipient.update.mockResolvedValue({ ...recipient, status: 'DECLINED' } as never);
      db.offer.update.mockResolvedValue({ ...makeOffer(), status: 'DECLINED' } as never);
      // Required for best-effort decline notification email (loads sender contact details)
      db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/decline`)
        .expect(200);

      expect(res.body).toMatchObject({ declined: true });
      expect(db.offer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DECLINED' } }),
      );
    });

    it('returns 404 when called with an invalid token', async () => {
      db.offerRecipient.findFirst.mockResolvedValue(null as never);

      await request(app.getHttpServer())
        .post('/api/v1/signing/oa_bad_token/decline')
        .expect(404);
    });
  });

  // ── No session guard ────────────────────────────────────────────────────────

  describe('Session required endpoints without a session', () => {
    it('returns session expired when verifyOtp is called before requestOtp', async () => {
      const recipient = makeRecipient();
      db.offerRecipient.findFirst.mockResolvedValue(recipient as never);
      db.signingSession.findFirst.mockResolvedValue(null as never); // no session

      const res = await request(app.getHttpServer())
        .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp/verify`)
        .send({ challengeId: 'challenge-1', code: '123456' })
        .expect(422);

      expect(res.body.code).toBe('SESSION_EXPIRED');
    });
  });
});
