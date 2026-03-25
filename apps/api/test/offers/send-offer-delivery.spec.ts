import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { OffersModule } from '../../src/modules/offers/offers.module';
import { EmailModule } from '../../src/common/email/email.module';
import { AuthModule } from '../../src/common/auth/auth.module';
import { DatabaseModule } from '../../src/modules/database/database.module';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { DevEmailAdapter } from '../../src/common/email/dev-email.adapter';
import { ResendDeliveryError } from '../../src/common/email/resend-email.adapter';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import {
  createMockOffersDb,
  MockOffersDb,
  makeDraftOffer,
  makeSentOffer,
  makeRecipient,
  makeDocument,
  makeSender,
  ORG_ID,
  USER_ID,
} from './mock-offers-db';

// ─── Delivery tracking and resend tests ───────────────────────────────────────
//
// Tests in this file verify:
//   1. Successful delivery records DELIVERED_TO_PROVIDER attempt
//   2. Failed delivery records FAILED attempt — offer stays SENT, no throw
//   3. Delivery outcome is included in the send response
//   4. Resend: generates new attempt; rejects wrong-status offers
//   5. Resend: uses frozen snapshot content, not mutable offer
//   6. Resend: fails when token is invalidated (revoked)
//   7. Resend: email failure creates FAILED attempt but does not throw
//   8. GET /offers/:id/delivery returns history + latestOutcome
//   9. Snapshots are never mutated by resend

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';

function makeJwt(jwtService: JwtService) {
  return jwtService.sign({ sub: USER_ID, orgId: ORG_ID, role: 'OWNER' });
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    offerId: 'offer-1',
    title: 'Website Redesign Proposal',
    senderName: 'Bob Sender',
    senderEmail: 'bob@mycompany.com',
    message: 'Please review.',
    expiresAt: null,
    contentHash: 'a'.repeat(64),
    frozenAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  };
}

describe('Offer link delivery tracking', () => {
  let app: INestApplication;
  let db: MockOffersDb;
  let emailAdapter: DevEmailAdapter;
  let jwtService: JwtService;
  let token: string;

  beforeEach(async () => {
    db = createMockOffersDb();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            NODE_ENV: 'test',
            JWT_SECRET,
            JWT_EXPIRY: '1h',
            WEB_BASE_URL: 'https://app.test',
            EMAIL_FROM: 'noreply@test.com',
          })],
        }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
        DatabaseModule,
        AuthModule,
        EmailModule,
        OffersModule,
      ],
    })
      .overrideProvider('PRISMA')
      .useValue(db)
      .overrideProvider(DealEventService)
      .useValue({ emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();

    emailAdapter = module.get(DevEmailAdapter);
    jwtService = module.get(JwtService);
    token = makeJwt(jwtService);
  });

  afterEach(async () => {
    await app.close();
    emailAdapter.reset();
    jest.restoreAllMocks();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setupSendMocks(overrides: { recipient?: object; documents?: object[] } = {}) {
    const recipient = makeRecipient((overrides.recipient ?? {}) as Record<string, unknown>);
    const document = makeDocument();
    const offer = makeDraftOffer({ recipient, documents: overrides.documents ?? [document] });

    db.offer.findFirst.mockResolvedValue(offer as never);
    db.user.findUniqueOrThrow.mockResolvedValue(makeSender() as never);
    db.offerSnapshot.create.mockResolvedValue(makeSnapshot() as never);
    db.offerSnapshotDocument.create.mockResolvedValue({} as never);
    db.offerRecipient.update.mockResolvedValue(recipient as never);
    db.offer.updateMany.mockResolvedValue({ count: 1 } as never);

    // Delivery attempt lifecycle
    const attemptId = 'attempt-1';
    db.offerDeliveryAttempt.create.mockResolvedValue({ id: attemptId, outcome: 'DISPATCHING' } as never);
    db.offerDeliveryAttempt.update.mockResolvedValue({} as never);

    return { offer, recipient, attemptId };
  }

  // ── send() — delivery tracking ──────────────────────────────────────────────

  it('records DELIVERED_TO_PROVIDER attempt when email succeeds', async () => {
    const { attemptId } = setupSendMocks();

    const res = await request(app.getHttpServer())
      .post('/offers/offer-1/send')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.deliveryOutcome).toBe('DELIVERED_TO_PROVIDER');
    expect(res.body.deliveryAttemptId).toBe(attemptId);

    // Attempt created with DISPATCHING
    expect(db.offerDeliveryAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          offerId: 'offer-1',
          outcome: 'DISPATCHING',
          attemptedBy: null,
        }),
      }),
    );

    // Attempt updated to DELIVERED_TO_PROVIDER
    expect(db.offerDeliveryAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: attemptId },
        data: { outcome: 'DELIVERED_TO_PROVIDER' },
      }),
    );
  });

  it('records FAILED attempt when email throws — offer stays SENT, response is 200', async () => {
    const { attemptId } = setupSendMocks();

    // Override DevEmailAdapter to simulate delivery failure
    jest.spyOn(emailAdapter, 'sendOfferLink').mockRejectedValue(
      new ResendDeliveryError(422, 'Domain not verified'),
    );

    const res = await request(app.getHttpServer())
      .post('/offers/offer-1/send')
      .set('Authorization', `Bearer ${token}`)
      .expect(200); // NOT 500 — offer state is valid even if email fails

    expect(res.body.deliveryOutcome).toBe('FAILED');
    expect(res.body.deliveryAttemptId).toBe(attemptId);

    // Attempt updated to FAILED with provider details
    expect(db.offerDeliveryAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: attemptId },
        data: expect.objectContaining({
          outcome: 'FAILED',
          failureCode: 422,
          failureReason: 'Domain not verified',
        }),
      }),
    );
  });

  it('send response includes snapshotId, sentAt, deliveryAttemptId, deliveryOutcome', async () => {
    setupSendMocks();

    const res = await request(app.getHttpServer())
      .post('/offers/offer-1/send')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      offerId: 'offer-1',
      status: 'SENT',
      snapshotId: expect.any(String),
      sentAt: expect.any(String),
      deliveryAttemptId: expect.any(String),
      deliveryOutcome: expect.stringMatching(/^(DELIVERED_TO_PROVIDER|FAILED)$/),
    });
  });

  it('delivery attempt tokenHash matches the token stored on OfferRecipient', async () => {
    setupSendMocks();

    await request(app.getHttpServer())
      .post('/offers/offer-1/send')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The tokenHash in the delivery attempt must match the one set on OfferRecipient.
    const recipientUpdate = db.offerRecipient.update.mock.calls[0][0] as { data: { tokenHash: string } };
    const attemptCreate = db.offerDeliveryAttempt.create.mock.calls[0][0] as { data: { tokenHash: string } };

    expect(attemptCreate.data.tokenHash).toBe(recipientUpdate.data.tokenHash);
  });

  // ── resend() ────────────────────────────────────────────────────────────────

  it('resend creates a new DELIVERED_TO_PROVIDER attempt and returns 200', async () => {
    const recipient = makeRecipient({ tokenInvalidatedAt: null });
    const sentOffer = makeSentOffer({ recipient });

    db.offer.findFirst.mockResolvedValue(sentOffer as never);
    db.offerRecipient.update.mockResolvedValue(recipient as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);

    const resendAttemptId = 'resend-attempt-1';
    db.offerDeliveryAttempt.create.mockResolvedValue({ id: resendAttemptId, outcome: 'DISPATCHING' } as never);
    db.offerDeliveryAttempt.update.mockResolvedValue({} as never);

    const res = await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      offerId: 'offer-1',
      deliveryAttemptId: resendAttemptId,
      deliveryOutcome: 'DELIVERED_TO_PROVIDER',
    });

    // A new token was generated and set on the recipient
    expect(db.offerRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { offerId: 'offer-1' },
        data: expect.objectContaining({
          tokenInvalidatedAt: null,
        }),
      }),
    );

    // attemptedBy is the authenticated user
    expect(db.offerDeliveryAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptedBy: USER_ID,
          outcome: 'DISPATCHING',
        }),
      }),
    );
  });

  it('resend uses frozen snapshot content for email, not mutable offer title', async () => {
    const recipient = makeRecipient({ tokenInvalidatedAt: null });
    db.offer.findFirst.mockResolvedValue(makeSentOffer({ recipient, title: 'Mutable Title (should be ignored)' }) as never);
    db.offerRecipient.update.mockResolvedValue(recipient as never);

    // Snapshot has the frozen title
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(
      makeSnapshot({ title: 'Frozen Snapshot Title' }) as never,
    );

    db.offerDeliveryAttempt.create.mockResolvedValue({ id: 'ra-1', outcome: 'DISPATCHING' } as never);
    db.offerDeliveryAttempt.update.mockResolvedValue({} as never);

    const spy = jest.spyOn(emailAdapter, 'sendOfferLink');

    await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ offerTitle: 'Frozen Snapshot Title' }),
    );
  });

  it('resend with email failure creates FAILED attempt — returns 200', async () => {
    const recipient = makeRecipient({ tokenInvalidatedAt: null });
    db.offer.findFirst.mockResolvedValue(makeSentOffer({ recipient }) as never);
    db.offerRecipient.update.mockResolvedValue(recipient as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.offerDeliveryAttempt.create.mockResolvedValue({ id: 'ra-fail', outcome: 'DISPATCHING' } as never);
    db.offerDeliveryAttempt.update.mockResolvedValue({} as never);

    jest.spyOn(emailAdapter, 'sendOfferLink').mockRejectedValue(
      new ResendDeliveryError(403, 'Invalid API key'),
    );

    const res = await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.deliveryOutcome).toBe('FAILED');
    expect(db.offerDeliveryAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: 'FAILED',
          failureCode: 403,
          failureReason: 'Invalid API key',
        }),
      }),
    );
  });

  it('resend returns 409 when offer status is not SENT', async () => {
    db.offer.findFirst.mockResolvedValue(makeDraftOffer() as never);

    await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('resend returns 409 when recipient token is invalidated', async () => {
    const recipient = makeRecipient({ tokenInvalidatedAt: new Date() });
    db.offer.findFirst.mockResolvedValue(makeSentOffer({ recipient }) as never);

    await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('resend returns 404 when offer does not exist', async () => {
    db.offer.findFirst.mockResolvedValue(null as never);

    await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('resend does not mutate OfferSnapshot', async () => {
    const recipient = makeRecipient({ tokenInvalidatedAt: null });
    db.offer.findFirst.mockResolvedValue(makeSentOffer({ recipient }) as never);
    db.offerRecipient.update.mockResolvedValue(recipient as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.offerDeliveryAttempt.create.mockResolvedValue({ id: 'ra-2', outcome: 'DISPATCHING' } as never);
    db.offerDeliveryAttempt.update.mockResolvedValue({} as never);

    await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // OfferSnapshot must never be written to during resend
    expect(db.offerSnapshot.create).not.toHaveBeenCalled();
  });

  it('resend generates a different token than the previous one', async () => {
    const recipient = makeRecipient({ tokenHash: 'original-token-hash', tokenInvalidatedAt: null });
    db.offer.findFirst.mockResolvedValue(makeSentOffer({ recipient }) as never);
    db.offerRecipient.update.mockResolvedValue(recipient as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.offerDeliveryAttempt.create.mockResolvedValue({ id: 'ra-3', outcome: 'DISPATCHING' } as never);
    db.offerDeliveryAttempt.update.mockResolvedValue({} as never);

    await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const newTokenHash = (db.offerRecipient.update.mock.calls[0][0] as { data: { tokenHash: string } }).data.tokenHash;
    expect(newTokenHash).not.toBe('original-token-hash');
    expect(newTokenHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  // ── GET /offers/:id/delivery ────────────────────────────────────────────────

  it('GET /offers/:id/delivery returns attempt history and latestOutcome', async () => {
    db.offer.findFirst.mockResolvedValue({ id: 'offer-1' } as never);

    const attempts = [
      {
        id: 'ra-2',
        outcome: 'DELIVERED_TO_PROVIDER',
        recipientEmail: 'client@acme.com',
        failureCode: null,
        failureReason: null,
        attemptedBy: USER_ID,
        attemptedAt: new Date('2024-01-02T12:00:00Z'),
      },
      {
        id: 'ra-1',
        outcome: 'FAILED',
        recipientEmail: 'client@acme.com',
        failureCode: 422,
        failureReason: 'Domain not verified',
        attemptedBy: null,
        attemptedAt: new Date('2024-01-01T10:00:00Z'),
      },
    ];
    db.offerDeliveryAttempt.findMany.mockResolvedValue(attempts as never);

    const res = await request(app.getHttpServer())
      .get('/offers/offer-1/delivery')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.latestOutcome).toBe('DELIVERED_TO_PROVIDER');
    expect(res.body.attempts).toHaveLength(2);
    expect(res.body.attempts[0].id).toBe('ra-2');
    expect(res.body.attempts[1].outcome).toBe('FAILED');
  });

  it('GET /offers/:id/delivery returns null latestOutcome when no attempts exist', async () => {
    db.offer.findFirst.mockResolvedValue({ id: 'offer-1' } as never);
    db.offerDeliveryAttempt.findMany.mockResolvedValue([] as never);

    const res = await request(app.getHttpServer())
      .get('/offers/offer-1/delivery')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.latestOutcome).toBeNull();
    expect(res.body.attempts).toHaveLength(0);
  });

  it('GET /offers/:id/delivery returns 404 when offer does not belong to org', async () => {
    db.offer.findFirst.mockResolvedValue(null as never);

    await request(app.getHttpServer())
      .get('/offers/offer-1/delivery')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /offers/:id/delivery requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/offers/offer-1/delivery')
      .expect(401);
  });

  it('POST /offers/:id/resend requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/offers/offer-1/resend')
      .expect(401);
  });
});
