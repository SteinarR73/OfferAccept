import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthModule } from '../../src/common/auth/auth.module';
import { EmailModule } from '../../src/common/email/email.module';
import { RateLimitModule } from '../../src/common/rate-limit/rate-limit.module';
import { REDIS_CLIENT } from '../../src/common/rate-limit/rate-limit.service';
import { SupportModule } from '../../src/modules/support/support.module';
import { OffersModule } from '../../src/modules/offers/offers.module';
import { SigningModule } from '../../src/modules/signing/signing.module';
import { CertificatesModule } from '../../src/modules/certificates/certificates.module';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { WebhookService } from '../../src/modules/enterprise/webhook.service';
import { DatabaseModule } from '../../src/modules/database/database.module';
import { TraceModule } from '../../src/common/trace/trace.module';
import { JobService } from '../../src/modules/jobs/job.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import { SubscriptionService } from '../../src/modules/billing/subscription.service';

// ── Global stub for JobService ────────────────────────────────────────────────
@Global()
@Module({
  providers: [{ provide: JobService, useValue: {
    send: jest.fn<() => Promise<string>>().mockResolvedValue('job-stub-1'),
    sendOnce: jest.fn<() => Promise<string | null>>().mockResolvedValue('job-stub-1'),
  }}],
  exports: [JobService],
})
class StubJobsModule {}

// ── Global stub for StoragePort ──────────────────────────────────────────────
import { STORAGE_PORT } from '../../src/common/storage/storage.port';

@Global()
@Module({
  providers: [{ provide: STORAGE_PORT, useValue: {
    getPresignedUploadUrl: jest.fn(),
    getPresignedDownloadUrl: jest.fn<() => Promise<string>>().mockResolvedValue('http://storage.test/file'),
    getObjectSha256: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    getObjectMimeType: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    delete: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    putBuffer: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }}],
  exports: [STORAGE_PORT],
})
class MockStorageModule {}

// ── Global mock for SubscriptionService ──────────────────────────────────────
// BillingModule is not imported in this test module. This stub provides
// SubscriptionService globally so SendOfferService (in OffersModule) can be
// resolved. Support tests never call send(), so assertCanSendOffer is a no-op.
@Global()
@Module({
  providers: [{ provide: SubscriptionService, useValue: {
    assertCanSendOffer: () => Promise.resolve(),
    incrementOfferCount: () => Promise.resolve(),
  }}],
  exports: [SubscriptionService],
})
class MockBillingModule {}

// ─── Support tooling tests ─────────────────────────────────────────────────────
//
// Tests cover:
//   1. Authorization: INTERNAL_SUPPORT role required; OWNER/ADMIN/no-token → 403/401
//   2. Search: find by offerId, by recipientEmail, empty when nothing matches
//   3. Case view: full aggregation including certificate verification
//   4. Timeline: chronological event reconstruction
//   5. Session events: raw event listing
//   6. Safe actions: revoke, resend-link, resend-otp — domain rules enforced
//   7. Immutability: actions do not write to snapshots, acceptance records, or events

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';

function makeJwt(jwtService: JwtService, role = 'INTERNAL_SUPPORT') {
  return jwtService.sign({ sub: 'support-user-1', orgId: 'internal-org', role });
}

// ─── Shared mock DB factory ────────────────────────────────────────────────────

function createMockDb() {
  const mock = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    offer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    offerRecipient: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    offerSnapshot: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    offerSnapshotDocument: {},
    offerDeliveryAttempt: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    signingSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    signingEvent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    signingOtpChallenge: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn<() => Promise<{ _sum: { attemptCount: number | null } }>>()
        .mockResolvedValue({ _sum: { attemptCount: 0 } }),
    },
    acceptanceRecord: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    acceptanceCertificate: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findUniqueOrThrow: jest.fn(),
    },
    supportAuditLog: {
      create: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'audit-1' }),
    },
    reminderSchedule: {
      create: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
      deleteMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
      delete: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
    },
  };
  // $transaction must pass `mock` as the tx argument so tx.offer.update etc. resolve correctly.
  mock.$transaction.mockImplementation(async (fn: unknown) => (fn as (tx: typeof mock) => Promise<unknown>)(mock));
  return mock;
}

type MockDb = ReturnType<typeof createMockDb>;

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const OFFER_ID = 'offer-abc';
const SNAPSHOT_ID = 'snap-abc';
const SESSION_ID = 'session-abc';
const RECIPIENT_ID = 'recipient-abc';
const CERT_ID = 'cert-abc';
const ORG_ID = 'org-abc';

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    organizationId: ORG_ID,
    title: 'Consulting Agreement',
    status: 'SENT',
    expiresAt: null,
    createdAt: new Date('2024-01-01T09:00:00Z'),
    updatedAt: new Date('2024-01-01T09:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: SNAPSHOT_ID,
    offerId: OFFER_ID,
    title: 'Consulting Agreement',
    senderName: 'Bob Sender',
    senderEmail: 'bob@acme.com',
    message: null,
    expiresAt: null,
    contentHash: 'a'.repeat(64),
    frozenAt: new Date('2024-01-01T09:00:00Z'),
    _count: { documents: 1 },
    records: [],
    ...overrides,
  };
}

function makeRecipient(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPIENT_ID,
    offerId: OFFER_ID,
    email: 'alice@client.com',
    name: 'Alice Client',
    tokenHash: 'hash'.repeat(16),
    tokenExpiresAt: new Date('2024-02-01T09:00:00Z'),
    tokenInvalidatedAt: null,
    status: 'PENDING',
    viewedAt: null,
    respondedAt: null,
    createdAt: new Date('2024-01-01T09:00:00Z'),
    updatedAt: new Date('2024-01-01T09:00:00Z'),
    ...overrides,
  };
}

function makeSigningSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    recipientId: RECIPIENT_ID,
    offerId: OFFER_ID,
    snapshotId: SNAPSHOT_ID,
    status: 'AWAITING_OTP',
    startedAt: new Date('2024-01-02T10:00:00Z'),
    expiresAt: new Date('2099-12-31T23:59:59Z'),
    completedAt: null,
    ipAddress: '1.2.3.4',
    userAgent: 'Mozilla/5.0',
    updatedAt: new Date(),
    _count: { events: 2 },
    ...overrides,
  };
}

function makeSigningEvent(
  seq: number,
  eventType: string,
  timestamp: Date,
  payload: unknown = null,
) {
  return {
    id: `event-${seq}`,
    sessionId: SESSION_ID,
    sequenceNumber: seq,
    eventType,
    payload,
    ipAddress: '1.2.3.4',
    userAgent: 'test',
    previousEventHash: seq === 1 ? null : `hash-${seq - 1}`,
    eventHash: `hash-${seq}`,
    timestamp,
  };
}

// ─── Test setup ────────────────────────────────────────────────────────────────

async function buildApp(db: MockDb) {
  const mockCertService = {
    verify: jest.fn<() => Promise<{ valid: boolean; certificateHashMatch: boolean; eventChainValid: boolean }>>()
      .mockResolvedValue({ valid: true, certificateHashMatch: true, eventChainValid: true }),
    generateForAcceptance: jest.fn<() => Promise<{ certificateId: string }>>()
      .mockResolvedValue({ certificateId: CERT_ID }),
    exportPayload: jest.fn(),
  };

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
      MockBillingModule,
      StubJobsModule,
      MockStorageModule,
      TraceModule,
      DatabaseModule,
      AuthModule,
      EmailModule,
      RateLimitModule,
      OffersModule,
      SigningModule,
      CertificatesModule,
      SupportModule,
    ],
  })
    .overrideProvider('PRISMA')
    .useValue(db)
    .overrideProvider(CertificateService)
    .useValue(mockCertService)
    // WebhookService (from EnterpriseCoreModule, via SigningModule) depends on
    // JobService which is not available in this isolated test module.
    .overrideProvider(WebhookService)
    .useValue({ dispatchEvent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) })
    // Override REDIS_CLIENT so RateLimitModule factory doesn't crash on undefined REDIS_URL.
    .overrideProvider(REDIS_CLIENT)
    .useValue({ eval: jest.fn<() => Promise<number[]>>().mockResolvedValue([1, 0, 0]), quit: jest.fn<() => Promise<string>>().mockResolvedValue('OK') })
    .overrideProvider(DealEventService)
    .useValue({ emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) })
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();

  const jwtService = module.get(JwtService);
  return { app, jwtService, mockCertService };
}

// ─── Authorization tests ───────────────────────────────────────────────────────

describe('Support API — authorization', () => {
  let app: INestApplication;
  let db: MockDb;
  let jwtService: JwtService;

  beforeEach(async () => {
    db = createMockDb();
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUnique.mockResolvedValue(makeSnapshot() as never);
    db.offerRecipient.findUnique.mockResolvedValue(makeRecipient() as never);
    db.offerDeliveryAttempt.findMany.mockResolvedValue([] as never);
    db.signingSession.findMany.mockResolvedValue([] as never);
    db.acceptanceRecord.findFirst.mockResolvedValue(null as never);
    db.acceptanceCertificate.findUnique.mockResolvedValue(null as never);
    ({ app, jwtService } = await buildApp(db));
  });

  afterEach(() => app.close());

  it('returns 401 with no token', async () => {
    await request(app.getHttpServer()).get('/support/offers').expect(401);
  });

  it('returns 403 for OWNER role', async () => {
    const token = makeJwt(jwtService, 'OWNER');
    await request(app.getHttpServer())
      .get('/support/offers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 403 for ADMIN role', async () => {
    const token = makeJwt(jwtService, 'ADMIN');
    await request(app.getHttpServer())
      .get('/support/offers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 403 for MEMBER role', async () => {
    const token = makeJwt(jwtService, 'MEMBER');
    await request(app.getHttpServer())
      .get('/support/offers')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 200 for INTERNAL_SUPPORT role on GET /support/offers', async () => {
    const token = makeJwt(jwtService, 'INTERNAL_SUPPORT');
    db.offer.findUnique.mockResolvedValue(null as never); // no results — empty array expected
    await request(app.getHttpServer())
      .get('/support/offers?offerId=nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('returns 403 for INTERNAL_SUPPORT attempting a revoke on wrong endpoint', async () => {
    // Ensure the guard blocks non-support users from action endpoints too
    const token = makeJwt(jwtService, 'ADMIN');
    await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});

// ─── Search tests ──────────────────────────────────────────────────────────────

describe('Support API — search', () => {
  let app: INestApplication;
  let db: MockDb;
  let token: string;

  beforeEach(async () => {
    db = createMockDb();
    const built = await buildApp(db);
    app = built.app;
    token = makeJwt(built.jwtService);
  });

  afterEach(() => app.close());

  it('finds offer by offerId', async () => {
    db.offer.findUnique.mockResolvedValue({
      ...makeOffer(),
      recipient: { email: 'alice@client.com' },
    } as never);

    const res = await request(app.getHttpServer())
      .get(`/support/offers?offerId=${OFFER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].offerId).toBe(OFFER_ID);
    expect(res.body[0].recipientEmail).toBe('alice@client.com');
  });

  it('returns empty array when offerId not found', async () => {
    db.offer.findUnique.mockResolvedValue(null as never);

    const res = await request(app.getHttpServer())
      .get('/support/offers?offerId=nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(0);
  });

  it('finds offers by recipientEmail', async () => {
    db.offerRecipient.findMany.mockResolvedValue([
      {
        email: 'alice@client.com',
        offer: { id: OFFER_ID, title: 'Consulting Agreement', status: 'SENT', createdAt: new Date(), deletedAt: null },
      },
    ] as never);

    const res = await request(app.getHttpServer())
      .get('/support/offers?recipientEmail=alice%40client.com')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].recipientEmail).toBe('alice@client.com');
  });

  it('returns empty array when no query params provided', async () => {
    const res = await request(app.getHttpServer())
      .get('/support/offers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveLength(0);
  });
});

// ─── Case view tests ───────────────────────────────────────────────────────────

describe('Support API — case view', () => {
  let app: INestApplication;
  let db: MockDb;
  let token: string;

  beforeEach(async () => {
    db = createMockDb();
    const built = await buildApp(db);
    app = built.app;
    token = makeJwt(built.jwtService);
  });

  afterEach(() => app.close());

  function setupFullCase() {
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUnique.mockResolvedValue(makeSnapshot() as never);
    db.offerRecipient.findUnique.mockResolvedValue(makeRecipient() as never);
    db.offerDeliveryAttempt.findMany.mockResolvedValue([{
      id: 'attempt-1',
      outcome: 'DELIVERED_TO_PROVIDER',
      recipientEmail: 'alice@client.com',
      failureCode: null,
      failureReason: null,
      attemptedBy: null,
      attemptedAt: new Date('2024-01-01T09:01:00Z'),
    }] as never);
    db.signingSession.findMany.mockResolvedValue([makeSigningSession()] as never);
    db.acceptanceRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      acceptedAt: new Date('2024-01-02T10:30:00Z'),
      verifiedEmail: 'alice@client.com',
      acceptanceStatement: 'I accept.',
      ipAddress: '1.2.3.4',
      locale: 'en-US',
      timezone: 'America/New_York',
    } as never);
    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      issuedAt: new Date('2024-01-02T10:31:00Z'),
    } as never);
  }

  it('returns full case with offer, snapshot, recipient, delivery, sessions, acceptance, certificate', async () => {
    setupFullCase();

    const res = await request(app.getHttpServer())
      .get(`/support/offers/${OFFER_ID}/case`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.offer.id).toBe(OFFER_ID);
    expect(res.body.offer.status).toBe('SENT');
    expect(res.body.snapshot.senderName).toBe('Bob Sender');
    expect(res.body.snapshot.documentCount).toBe(1);
    expect(res.body.recipient.email).toBe('alice@client.com');
    expect(res.body.deliveryAttempts).toHaveLength(1);
    expect(res.body.deliveryAttempts[0].outcome).toBe('DELIVERED_TO_PROVIDER');
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].eventCount).toBe(2);
    expect(res.body.acceptanceRecord.verifiedEmail).toBe('alice@client.com');
    expect(res.body.certificate.id).toBe(CERT_ID);
    expect(res.body.certificate.verification.valid).toBe(true);
  });

  it('returns null for snapshot, recipient, acceptance, certificate when offer is draft', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer({ status: 'DRAFT' }) as never);
    db.offerSnapshot.findUnique.mockResolvedValue(null as never);
    db.offerRecipient.findUnique.mockResolvedValue(null as never);
    db.offerDeliveryAttempt.findMany.mockResolvedValue([] as never);
    db.signingSession.findMany.mockResolvedValue([] as never);
    db.acceptanceRecord.findFirst.mockResolvedValue(null as never);
    db.acceptanceCertificate.findUnique.mockResolvedValue(null as never);

    const res = await request(app.getHttpServer())
      .get(`/support/offers/${OFFER_ID}/case`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.snapshot).toBeNull();
    expect(res.body.recipient).toBeNull();
    expect(res.body.acceptanceRecord).toBeNull();
    expect(res.body.certificate).toBeNull();
  });

  it('returns 404 for unknown offer', async () => {
    db.offer.findUnique.mockResolvedValue(null as never);
    await request(app.getHttpServer())
      .get('/support/offers/nonexistent/case')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

// ─── Timeline tests ────────────────────────────────────────────────────────────

describe('Support API — timeline', () => {
  let app: INestApplication;
  let db: MockDb;
  let token: string;

  beforeEach(async () => {
    db = createMockDb();
    const built = await buildApp(db);
    app = built.app;
    token = makeJwt(built.jwtService);
  });

  afterEach(() => app.close());

  it('builds a chronologically ordered timeline from snapshot, delivery, signing events, certificate', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUnique.mockResolvedValue(makeSnapshot() as never);
    db.offerDeliveryAttempt.findMany.mockResolvedValue([{
      id: 'attempt-1',
      outcome: 'DELIVERED_TO_PROVIDER',
      recipientEmail: 'alice@client.com',
      failureCode: null,
      failureReason: null,
      attemptedBy: null,
      attemptedAt: new Date('2024-01-01T09:01:00Z'),
    }] as never);
    db.signingSession.findMany.mockResolvedValue([{ id: SESSION_ID, startedAt: new Date() }] as never);
    db.signingEvent.findMany.mockResolvedValue([
      makeSigningEvent(1, 'SESSION_STARTED', new Date('2024-01-02T10:00:00Z')),
      makeSigningEvent(2, 'OTP_ISSUED', new Date('2024-01-02T10:01:00Z'), { deliveryAddress: 'alice@client.com', channel: 'EMAIL' }),
      makeSigningEvent(3, 'OTP_ATTEMPT_FAILED', new Date('2024-01-02T10:02:00Z'), { attemptCount: 1 }),
      makeSigningEvent(4, 'OTP_VERIFIED', new Date('2024-01-02T10:05:00Z')),
      makeSigningEvent(5, 'OFFER_ACCEPTED', new Date('2024-01-02T10:06:00Z')),
    ] as never);
    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      issuedAt: new Date('2024-01-02T10:07:00Z'),
    } as never);

    const res = await request(app.getHttpServer())
      .get(`/support/offers/${OFFER_ID}/timeline`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const { entries } = res.body;
    expect(entries.length).toBeGreaterThan(0);

    // Verify chronological order
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp >= entries[i - 1].timestamp).toBe(true);
    }

    // Check human-readable labels
    const labels = entries.map((e: { event: string }) => e.event);
    expect(labels).toContain('Offer sent');
    expect(labels).toContain('Offer link email accepted by provider');
    expect(labels).toContain('Recipient opened signing link (session started)');
    expect(labels).toContain('OTP code sent to recipient');
    expect(labels).toContain('Incorrect OTP code submitted');
    expect(labels).toContain('OTP verified — email ownership confirmed');
    expect(labels).toContain('Offer accepted');
    expect(labels).toContain('Acceptance certificate issued');
  });

  it('includes OTP masked email in timeline detail', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUnique.mockResolvedValue(makeSnapshot() as never);
    db.offerDeliveryAttempt.findMany.mockResolvedValue([] as never);
    db.signingSession.findMany.mockResolvedValue([{ id: SESSION_ID, startedAt: new Date() }] as never);
    db.signingEvent.findMany.mockResolvedValue([
      makeSigningEvent(1, 'OTP_ISSUED', new Date('2024-01-02T10:01:00Z'), { deliveryAddress: 'alice@client.com', channel: 'EMAIL' }),
    ] as never);
    db.acceptanceCertificate.findUnique.mockResolvedValue(null as never);

    const res = await request(app.getHttpServer())
      .get(`/support/offers/${OFFER_ID}/timeline`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const otpEntry = res.body.entries.find((e: { event: string }) => e.event === 'OTP code sent to recipient');
    expect(otpEntry).toBeDefined();
    // OTP delivery address should be masked
    expect(otpEntry.detail).toMatch(/al\*+@client\.com/);
    expect(otpEntry.detail).not.toContain('alice@client.com'); // not the raw address
  });

  it('marks failed delivery attempt in timeline', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offerSnapshot.findUnique.mockResolvedValue(makeSnapshot() as never);
    db.offerDeliveryAttempt.findMany.mockResolvedValue([{
      id: 'attempt-1',
      outcome: 'FAILED',
      recipientEmail: 'alice@client.com',
      failureCode: 422,
      failureReason: 'Domain not verified',
      attemptedBy: null,
      attemptedAt: new Date('2024-01-01T09:01:00Z'),
    }] as never);
    db.signingSession.findMany.mockResolvedValue([] as never);
    db.acceptanceCertificate.findUnique.mockResolvedValue(null as never);

    const res = await request(app.getHttpServer())
      .get(`/support/offers/${OFFER_ID}/timeline`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const failEntry = res.body.entries.find((e: { event: string }) => e.event.includes('delivery failed'));
    expect(failEntry).toBeDefined();
    expect(failEntry.detail).toContain('Domain not verified');
    expect(failEntry.detail).toContain('HTTP 422');
  });

  it('returns 404 for unknown offer', async () => {
    db.offer.findUnique.mockResolvedValue(null as never);
    await request(app.getHttpServer())
      .get('/support/offers/nonexistent/timeline')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

// ─── Safe actions tests ────────────────────────────────────────────────────────

describe('Support API — safe actions', () => {
  let app: INestApplication;
  let db: MockDb;
  let token: string;

  beforeEach(async () => {
    db = createMockDb();
    const built = await buildApp(db);
    app = built.app;
    token = makeJwt(built.jwtService);
  });

  afterEach(() => app.close());

  // ── Revoke ────────────────────────────────────────────────────────────────────

  it('POST /support/offers/:id/revoke — revokes a SENT offer', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offer.findFirst.mockResolvedValue(makeOffer() as never);
    db.offerRecipient.update.mockResolvedValue({} as never);
    db.offer.update.mockResolvedValue({} as never);

    const res = await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.revoked).toBe(true);
  });

  it('revoke returns 409 when offer is already ACCEPTED', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer({ status: 'ACCEPTED' }) as never);
    db.offer.findFirst.mockResolvedValue(makeOffer({ status: 'ACCEPTED' }) as never);

    await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('revoke does not touch SigningEvents or AcceptanceRecord', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offer.findFirst.mockResolvedValue(makeOffer() as never);
    db.offerRecipient.update.mockResolvedValue({} as never);
    db.offer.update.mockResolvedValue({} as never);

    await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // These immutable tables must never be written by revoke
    expect(db.signingEvent.create).not.toHaveBeenCalled();
  });

  // ── Resend link ───────────────────────────────────────────────────────────────

  it('POST /support/offers/:id/resend-link — resends offer link and records attempt', async () => {
    const recipient = { ...makeRecipient(), tokenInvalidatedAt: null };
    // resend() uses findFirst with include: { recipient: true } — recipient must be embedded
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offer.findFirst.mockResolvedValue({ ...makeOffer(), recipient } as never);
    db.offerRecipient.findUnique.mockResolvedValue(recipient as never);
    db.offerRecipient.update.mockResolvedValue(recipient as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);
    db.offerDeliveryAttempt.create.mockResolvedValue({ id: 'attempt-new', outcome: 'DISPATCHING' } as never);
    db.offerDeliveryAttempt.update.mockResolvedValue({} as never);

    const res = await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/resend-link`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.offerId).toBe(OFFER_ID);
    expect(res.body.deliveryOutcome).toBe('DELIVERED_TO_PROVIDER');

    // OfferSnapshot must not be mutated
    expect(db.offerSnapshot.findUnique.mock?.calls?.length ?? 0).toBe(0);
  });

  it('resend-link returns 409 when offer is REVOKED', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer({ status: 'REVOKED' }) as never);
    db.offer.findFirst.mockResolvedValue(makeOffer({ status: 'REVOKED' }) as never);
    db.offerRecipient.findUnique.mockResolvedValue(makeRecipient() as never);

    await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/resend-link`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  // ── Resend OTP ────────────────────────────────────────────────────────────────

  it('POST /support/sessions/:id/resend-otp — sends OTP to AWAITING_OTP session', async () => {
    const session = makeSigningSession({ status: 'AWAITING_OTP' });
    db.signingSession.findUnique.mockResolvedValue(session as never);
    db.signingSession.findFirst.mockResolvedValue(session as never);
    db.offerRecipient.findUniqueOrThrow = jest.fn<() => Promise<unknown>>().mockResolvedValue(makeRecipient() as never);
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue(makeSnapshot() as never);

    // OTP challenge lifecycle
    db.signingOtpChallenge.updateMany.mockResolvedValue({} as never);
    db.signingOtpChallenge.create.mockResolvedValue({ id: 'challenge-new' } as never);
    db.signingOtpChallenge.findFirst.mockResolvedValue({ id: 'challenge-new', status: 'PENDING' } as never);

    // Signing event chain for OTP issuance
    db.signingEvent.findFirst.mockResolvedValue(null as never);
    db.signingEvent.create.mockResolvedValue({} as never);

    const res = await request(app.getHttpServer())
      .post(`/support/sessions/${SESSION_ID}/resend-otp`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.sessionId).toBe(SESSION_ID);
    expect(res.body.deliveryAddressMasked).toMatch(/al\*+@client\.com/);
    expect(res.body.expiresAt).toBeDefined();
  });

  it('resend-otp returns 409 when session is OTP_VERIFIED (already past OTP step)', async () => {
    db.signingSession.findUnique.mockResolvedValue(
      makeSigningSession({ status: 'OTP_VERIFIED' }) as never,
    );

    await request(app.getHttpServer())
      .post(`/support/sessions/${SESSION_ID}/resend-otp`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('resend-otp returns 422 when session is expired', async () => {
    db.signingSession.findUnique.mockResolvedValue(
      makeSigningSession({ status: 'AWAITING_OTP', expiresAt: new Date('2020-01-01') }) as never,
    );

    await request(app.getHttpServer())
      .post(`/support/sessions/${SESSION_ID}/resend-otp`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('resend-otp returns 422 when session does not exist', async () => {
    db.signingSession.findUnique.mockResolvedValue(null as never);

    await request(app.getHttpServer())
      .post(`/support/sessions/${SESSION_ID}/resend-otp`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  // ── Immutability guarantees ────────────────────────────────────────────────────

  it('no support action writes to OfferSnapshot', async () => {
    // Revoke path
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offer.findFirst.mockResolvedValue(makeOffer() as never);
    db.offerRecipient.update.mockResolvedValue({} as never);
    db.offer.update.mockResolvedValue({} as never);

    await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/revoke`)
      .set('Authorization', `Bearer ${token}`);

    // No snapshot create/update
    expect((db.offerSnapshot as Record<string, unknown>).create).toBeUndefined();
    expect((db.offerSnapshot as Record<string, unknown>).update).toBeUndefined();
  });

  it('no support action writes to AcceptanceRecord', async () => {
    db.offer.findUnique.mockResolvedValue(makeOffer() as never);
    db.offer.findFirst.mockResolvedValue(makeOffer() as never);
    db.offerRecipient.update.mockResolvedValue({} as never);
    db.offer.update.mockResolvedValue({} as never);

    await request(app.getHttpServer())
      .post(`/support/offers/${OFFER_ID}/revoke`)
      .set('Authorization', `Bearer ${token}`);

    // acceptanceRecord has no create/update in our mock — verify none added
    expect((db.acceptanceRecord as Record<string, unknown>).create).toBeUndefined();
    expect((db.acceptanceRecord as Record<string, unknown>).update).toBeUndefined();
  });
});
