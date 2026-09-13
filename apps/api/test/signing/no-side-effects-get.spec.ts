// ─── Gate 1.3 — No side effects on GET signing endpoint ───────────────────────
//
// Launch gate requirement:
//   GET /signing/:token MUST NOT create a SigningSession.
//   GET /signing/:token MUST NOT send an OTP email.
//   Only POST /signing/:token/otp triggers session creation and OTP issuance.
//
// Why this matters: Email security scanners automatically follow links to scan
// for phishing. If opening the URL triggered an OTP send, the scanner would
// consume the OTP before the real recipient ever sees it, breaking the signing
// flow silently.
//
// This test verifies the contract at the HTTP level using the same in-memory
// mock infrastructure as the main signing-flow e2e suite.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { jest } from '@jest/globals';
import { SigningModule } from '../../src/modules/signing/signing.module';
import { RateLimitModule } from '../../src/common/rate-limit/rate-limit.module';
import { REDIS_CLIENT } from '../../src/common/rate-limit/rate-limit.service';
import { JobService } from '../../src/modules/jobs/job.service';
import { STORAGE_PORT } from '../../src/common/storage/storage.port';
import { MetricsService } from '../../src/common/metrics/metrics.service';

@Global()
@Module({})
class StubJobsModule {
  static register(value: unknown): DynamicModule {
    return {
      module: StubJobsModule,
      global: true,
      providers: [{ provide: JobService, useValue: value }],
      exports: [JobService],
    };
  }
}

@Global()
@Module({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers: [{ provide: STORAGE_PORT, useValue: { getPresignedDownloadUrl: (jest.fn() as any).mockResolvedValue('https://storage.test/cert.pdf') } }],
  exports: [STORAGE_PORT],
})
class MockStorageModule {}

@Global()
@Module({
  providers: [{ provide: MetricsService, useValue: {
    recordDealAccepted: () => undefined,
    recordCertificateVerification: () => undefined,
    recordCertificatePdfGenerated: () => undefined,
  }}],
  exports: [MetricsService],
})
class MockMetricsModule {}

import { AuthModule } from '../../src/common/auth/auth.module';
import { EmailModule } from '../../src/common/email/email.module';
import { DevEmailAdapter } from '../../src/common/email/dev-email.adapter';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { DatabaseModule } from '../../src/modules/database/database.module';
import { TraceModule } from '../../src/common/trace/trace.module';
import { WebhookService } from '../../src/modules/enterprise/webhook.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import {
  createMockDb,
  makeRecipient,
  makeOffer,
  makeSnapshot,
  VALID_RAW_TOKEN,
  MockDb,
} from './mock-db';

// ─── Gate 1.3 ─────────────────────────────────────────────────────────────────

describe('Gate 1.3 — GET /signing/:token has no side effects', () => {
  let app: INestApplication;
  let db: MockDb;
  let emailAdapter: DevEmailAdapter;

  beforeEach(async () => {
    db = createMockDb();
    const jobService = { send: jest.fn<() => Promise<string>>().mockResolvedValue('job-mock') };

    db.signingEvent.create.mockResolvedValue({ id: 'event-1', sequenceNumber: 1, eventHash: 'h1', previousEventHash: null } as never);
    db.signingEvent.findFirst.mockResolvedValue(null as never);

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({
            JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
            JWT_ACCESS_TTL: '15m',
            WEB_BASE_URL: 'https://app.test',
            EMAIL_FROM: 'noreply@test.com',
          })],
        }),
        DatabaseModule,
        TraceModule,
        AuthModule,
        RateLimitModule,
        EmailModule,
        StubJobsModule.register(jobService),
        MockStorageModule,
        MockMetricsModule,
        SigningModule,
      ],
    })
      .overrideProvider('PRISMA')
      .useValue(db)
      .overrideProvider(CertificateService)
      .useValue({ generateForAcceptance: jest.fn<() => Promise<{ certificateId: string }>>().mockResolvedValue({ certificateId: 'cert-mock-1' }) })
      .overrideProvider(WebhookService)
      .useValue({ dispatchEvent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ eval: jest.fn<() => Promise<number[]>>().mockResolvedValue([1, 0, 0]), quit: jest.fn<() => Promise<string>>().mockResolvedValue('OK') })
      .overrideProvider(DealEventService)
      .useValue({ emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) })
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

  it('does NOT create a SigningSession when GET /signing/:token is called', async () => {
    // Arrange: valid token with a SENT offer and snapshot
    db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
    db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    // findFirst on signingSession = no existing session (findResumable read-path)
    db.signingSession.findFirst.mockResolvedValue(null as never);

    // Act
    await request(app.getHttpServer())
      .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
      .expect(200);

    // Assert: SigningSession.create must never have been called
    expect(db.signingSession.create).not.toHaveBeenCalled();
  });

  it('does NOT send an OTP email when GET /signing/:token is called', async () => {
    // Arrange
    db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
    db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.signingSession.findFirst.mockResolvedValue(null as never);

    // Act
    await request(app.getHttpServer())
      .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
      .expect(200);

    // Assert: no OTP email was sent through the email adapter
    expect(emailAdapter.getLastCode('jane@example.com')).toBeNull();
  });

  it('does NOT create a SigningOtpChallenge when GET /signing/:token is called', async () => {
    // Arrange
    db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
    db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.signingSession.findFirst.mockResolvedValue(null as never);

    // Act
    await request(app.getHttpServer())
      .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
      .expect(200);

    // Assert: OTP challenge table was never written to
    expect(db.signingOtpChallenge.create).not.toHaveBeenCalled();
  });

  it('returns a 200 response with offer context without any writes', async () => {
    // Arrange
    db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
    db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.signingSession.findFirst.mockResolvedValue(null as never);

    // Act
    const res = await request(app.getHttpServer())
      .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
      .expect(200);

    // Assert: response contains expected read-only context
    expect(res.body).toMatchObject({
      offerTitle: 'Software Development Agreement',
      senderName: 'Acme Corp',
      recipientName: 'Jane Smith',
    });

    // Confirm no write operations occurred on any table
    expect(db.signingSession.create).not.toHaveBeenCalled();
    expect(db.signingOtpChallenge.create).not.toHaveBeenCalled();
    expect(db.acceptanceRecord.create).not.toHaveBeenCalled();
    expect(db.offerRecipient.update).not.toHaveBeenCalled();
    // offer.update is not called (no viewedAt or status change on GET)
    expect(db.signingEvent.create).not.toHaveBeenCalled();
  });

  it('only POST /signing/:token/otp triggers session creation', async () => {
    // Arrange: set up the DB for a full OTP request
    db.offerRecipient.findFirst.mockResolvedValue(makeRecipient() as never);
    db.offer.findUniqueOrThrow.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.signingSession.findFirst.mockResolvedValue(null as never);
    db.signingSession.create.mockResolvedValue({
      id: 'session-new',
      recipientId: 'recipient-1',
      offerId: 'offer-1',
      status: 'AWAITING_OTP',
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    } as never);
    db.signingOtpChallenge.create.mockResolvedValue({
      id: 'challenge-new',
      sessionId: 'session-new',
      recipientId: 'recipient-1',
      codeHash: 'x'.repeat(64),
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attemptCount: 0,
      maxAttempts: 5,
      channel: 'EMAIL',
      deliveryAddress: 'jane@example.com',
    } as never);
    db.offerRecipient.update.mockResolvedValue(makeRecipient() as never);

    // Act — GET first (no session created)
    await request(app.getHttpServer())
      .get(`/api/v1/signing/${VALID_RAW_TOKEN}`)
      .expect(200);

    expect(db.signingSession.create).not.toHaveBeenCalled();

    // Act — POST creates session
    await request(app.getHttpServer())
      .post(`/api/v1/signing/${VALID_RAW_TOKEN}/otp`)
      .expect(200);

    // Assert: session was created only after explicit POST intent
    expect(db.signingSession.create).toHaveBeenCalledTimes(1);
  });
});
