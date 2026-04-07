import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Global, Module } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { OffersModule } from '../../src/modules/offers/offers.module';
import { EmailModule } from '../../src/common/email/email.module';
import { AuthModule } from '../../src/common/auth/auth.module';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { DatabaseModule } from '../../src/modules/database/database.module';
import { DevEmailAdapter } from '../../src/common/email/dev-email.adapter';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import { RateLimitService } from '../../src/common/rate-limit/rate-limit.service';
import { SubscriptionService } from '../../src/modules/billing/subscription.service';

@Global()
@Module({
  providers: [
    { provide: RateLimitService, useValue: { check: () => Promise.resolve() } },
    { provide: SubscriptionService, useValue: {
      assertCanSendOffer: () => Promise.resolve(),
      incrementOfferCount: () => Promise.resolve(),
    }},
  ],
  exports: [RateLimitService, SubscriptionService],
})
class MockRateLimitModule {}
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';

function makeJwt(jwtService: JwtService) {
  return jwtService.sign({ sub: USER_ID, orgId: ORG_ID, role: 'OWNER' });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Offers Lifecycle (e2e)', () => {
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
        MockRateLimitModule,
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
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = module.get(JwtService);
    emailAdapter = module.get(DevEmailAdapter);
    emailAdapter.reset();
    token = makeJwt(jwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  // ── POST /offers — Create draft ──────────────────────────────────────────────

  describe('POST /api/v1/offers — create draft', () => {
    it('creates a DRAFT offer and returns offerId', async () => {
      const offer = makeDraftOffer();
      db.offer.create.mockResolvedValue(offer as never);
      // No recipient provided in body — no recipient create call
      db.offerRecipient.create.mockResolvedValue(null as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Website Redesign Proposal' })
        .expect(201);

      expect(res.body).toMatchObject({ offerId: 'offer-1', status: 'DRAFT' });
    });

    it('creates draft with recipient when provided', async () => {
      const offer = makeDraftOffer();
      db.offer.create.mockResolvedValue(offer as never);
      db.offerRecipient.create.mockResolvedValue(makeRecipient() as never);

      await request(app.getHttpServer())
        .post('/api/v1/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Website Redesign Proposal',
          recipient: { email: 'client@acme.com', name: 'Alice Client' },
        })
        .expect(201);

      expect(db.offerRecipient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'client@acme.com', name: 'Alice Client' }),
        }),
      );
    });

    it('rejects create without title (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/offers')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'no title here' })
        .expect(400);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/offers')
        .send({ title: 'Test' })
        .expect(401);
    });
  });

  // ── PATCH /offers/:id — Update draft ─────────────────────────────────────────

  describe('PATCH /api/v1/offers/:id — update draft', () => {
    it('updates title/message on a DRAFT offer', async () => {
      db.offer.findFirst.mockResolvedValue(makeDraftOffer() as never);
      const updated = makeDraftOffer({ title: 'New Title' });
      db.offer.update.mockResolvedValue({ ...updated, recipient: null, documents: [] } as never);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/offers/offer-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Title' })
        .expect(200);

      expect(res.body.title).toBe('New Title');
    });

    it('rejects update on a SENT offer with 409', async () => {
      db.offer.findFirst.mockResolvedValue(makeSentOffer() as never);

      const res = await request(app.getHttpServer())
        .patch('/api/v1/offers/offer-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Sneaky Edit' })
        .expect(409);

      expect(res.body.code).toBe('OFFER_NOT_EDITABLE');
    });
  });

  // ── POST /offers/:id/documents — Add document ─────────────────────────────────

  describe('POST /api/v1/offers/:id/documents — add document', () => {
    it('adds document metadata to a DRAFT offer', async () => {
      db.offer.findFirst.mockResolvedValue(makeDraftOffer() as never);
      db.offerDocument.create.mockResolvedValue(makeDocument() as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'proposal.pdf',
          storageKey: 'uploads/org-1/proposal.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 102400,
          sha256Hash: 'a'.repeat(64),
        })
        .expect(201);

      expect(res.body.filename).toBe('proposal.pdf');
    });

    it('rejects invalid sha256Hash format', async () => {
      db.offer.findFirst.mockResolvedValue(makeDraftOffer() as never);

      await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'file.pdf',
          storageKey: 'uploads/x/file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256Hash: 'not-a-valid-hash',
        })
        .expect(400);
    });

    it('rejects adding a document to a SENT offer', async () => {
      db.offer.findFirst.mockResolvedValue(makeSentOffer() as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/documents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          filename: 'extra.pdf',
          storageKey: 'uploads/x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          sha256Hash: 'b'.repeat(64),
        })
        .expect(409);

      expect(res.body.code).toBe('OFFER_NOT_EDITABLE');
    });
  });

  // ── POST /offers/:id/send ─────────────────────────────────────────────────────

  describe('POST /api/v1/offers/:id/send — send offer', () => {
    function setupForSend() {
      const recipient = makeRecipient();
      const offerWithRecipient = {
        ...makeDraftOffer(),
        recipient,
        documents: [],
      };
      const sender = makeSender();

      db.offer.findFirst.mockResolvedValue(offerWithRecipient as never);
      db.user.findUniqueOrThrow.mockResolvedValue({ ...sender, id: USER_ID } as never);
      db.offerSnapshot.create.mockResolvedValue({
        id: 'snapshot-1',
        frozenAt: new Date(),
        contentHash: 'c'.repeat(64),
      } as never);
      db.offerRecipient.update.mockResolvedValue(recipient as never);
      db.offer.updateMany.mockResolvedValue({ count: 1 } as never);
      db.offerDeliveryAttempt.create.mockResolvedValue({ id: 'delivery-1' } as never);
      db.offerDeliveryAttempt.update.mockResolvedValue({ id: 'delivery-1' } as never);
    }

    it('creates snapshot, updates token, transitions to SENT, and sends email', async () => {
      setupForSend();

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/send')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ offerId: 'offer-1', status: 'SENT', snapshotId: 'snapshot-1' });

      // Email must have been sent
      expect(emailAdapter.getAllSentLinks()).toHaveLength(1);
      expect(emailAdapter.getAllSentLinks()[0].to).toBe('client@acme.com');
      expect(emailAdapter.getAllSentLinks()[0].signingUrl).toMatch(/^https:\/\/app\.test\/accept\/oa_/);
    });

    it('raw token is NOT in the snapshot data stored to DB', async () => {
      setupForSend();
      await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/send')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The offerRecipient.update call must use a tokenHash (SHA-256 hex), not the raw token
      const updateCall = (db.offerRecipient.update as jest.Mock).mock.calls[0][0] as {
        data: { tokenHash: string };
      };
      const { tokenHash } = updateCall.data;
      // Should be 64-char hex, never starting with 'oa_'
      expect(tokenHash).toHaveLength(64);
      expect(tokenHash).toMatch(/^[a-f0-9]+$/);
      expect(tokenHash).not.toMatch(/^oa_/);
    });

    it('rejects send when offer has no recipient (422)', async () => {
      db.offer.findFirst.mockResolvedValue(makeDraftOffer({ recipient: null }) as never);
      db.user.findUniqueOrThrow.mockResolvedValue(makeSender() as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/send')
        .set('Authorization', `Bearer ${token}`)
        .expect(422);

      expect(res.body.code).toBe('OFFER_INCOMPLETE');
      expect(res.body.detail?.missingFields).toContain('recipient');
    });

    it('rejects send when offer is already SENT (409)', async () => {
      db.offer.findFirst.mockResolvedValue(makeSentOffer() as never);
      db.user.findUniqueOrThrow.mockResolvedValue(makeSender() as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/send')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(res.body.code).toBe('OFFER_NOT_EDITABLE');
    });

    it('snapshot is created with content hash from server-trusted data, not client input', async () => {
      setupForSend();
      await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/send')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Snapshot must have been created (not skipped)
      expect(db.offerSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            // Sender identity comes from the DB user record, not request body
            senderName: 'Bob Sender',
            senderEmail: 'bob@mycompany.com',
          }),
        }),
      );
    });
  });

  // ── POST /offers/:id/revoke ───────────────────────────────────────────────────

  describe('POST /api/v1/offers/:id/revoke — revoke offer', () => {
    it('revokes a SENT offer and invalidates the token', async () => {
      db.offer.findFirst.mockResolvedValue(makeSentOffer() as never);
      db.offerRecipient.update.mockResolvedValue(makeRecipient({ tokenInvalidatedAt: new Date() }) as never);
      db.offer.update.mockResolvedValue({ ...makeSentOffer(), status: 'REVOKED' } as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/revoke')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({ revoked: true });
      expect(db.offerRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tokenInvalidatedAt: expect.any(Date) }),
        }),
      );
    });

    it('rejects revoke on a DRAFT offer with 409', async () => {
      db.offer.findFirst.mockResolvedValue(makeDraftOffer() as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/revoke')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(res.body.code).toBe('OFFER_NOT_REVOCABLE');
    });

    it('rejects revoke on an ACCEPTED offer with 409', async () => {
      db.offer.findFirst.mockResolvedValue({
        ...makeSentOffer(),
        status: 'ACCEPTED',
      } as never);

      const res = await request(app.getHttpServer())
        .post('/api/v1/offers/offer-1/revoke')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(res.body.code).toBe('OFFER_NOT_REVOCABLE');
    });
  });

  // ── Draft immutability after send ──────────────────────────────────────────

  describe('Draft immutability invariants', () => {
    it('blocks title update after send', async () => {
      db.offer.findFirst.mockResolvedValue(makeSentOffer() as never);
      await request(app.getHttpServer())
        .patch('/api/v1/offers/offer-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Late edit' })
        .expect(409);
    });

    it('blocks recipient change after send', async () => {
      db.offer.findFirst.mockResolvedValue(makeSentOffer() as never);
      await request(app.getHttpServer())
        .put('/api/v1/offers/offer-1/recipient')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'new@person.com', name: 'New Person' })
        .expect(409);
    });

    it('blocks document removal after send', async () => {
      db.offer.findFirst.mockResolvedValue(makeSentOffer() as never);
      await request(app.getHttpServer())
        .delete('/api/v1/offers/offer-1/documents/doc-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });
  });
});
