import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { CertificatePayloadBuilder, computeCertificateHash, computeCanonicalAcceptanceHash } from '../../src/modules/certificates/certificate-payload.builder';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import { computeSnapshotHash } from '../../src/modules/signing/domain/signing-event.builder';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CERT_ID = 'cert-1';
const RECORD_ID = 'record-1';
const ISSUED_AT = new Date('2024-06-01T12:00:00.000Z');
const SESSION_ID = 'session-1';
const OFFER_ID = 'offer-1';

function makePayload() {
  return {
    certificateId: CERT_ID,
    issuedAt: ISSUED_AT.toISOString(),
    issuer: 'OfferAccept' as const,
    issuerVersion: '1.0' as const,
    offer: {
      title: 'Test Offer',
      message: null,
      expiresAt: null,
      sentAt: '2024-05-31T10:00:00.000Z',
      snapshotContentHash: 'a'.repeat(64),
    },
    sender: { name: 'Alice', email: 'alice@co.com' },
    recipient: { name: 'Bob', verifiedEmail: 'bob@client.com' },
    documents: [],
    acceptance: {
      statement: 'I agree.',
      acceptedAt: '2024-06-01T11:59:00.000Z',
      verifiedEmail: 'bob@client.com',
      emailVerifiedAt: '2024-06-01T11:55:00.000Z',
      ipAddress: null,
      userAgent: null,
      locale: null,
      timezone: null,
    },
  };
}

function makeBuiltCert() {
  const payload = makePayload();
  const { hash, canonical } = computeCertificateHash(payload);
  return { payload, certificateHash: hash, canonicalJson: canonical };
}

// ─── CertificateService.verify() ──────────────────────────────────────────────

describe('CertificateService.verify()', () => {
  let service: CertificateService;
  let db: {
    acceptanceCertificate: { findUnique: jest.Mock<(...args: any[]) => any> };
    acceptanceRecord: { findUniqueOrThrow: jest.Mock<(...args: any[]) => any>; findUnique: jest.Mock<(...args: any[]) => any> };
    offerSnapshot: { findUniqueOrThrow: jest.Mock<(...args: any[]) => any> };
    signingEvent: { findFirst: jest.Mock<(...args: any[]) => any> };
    offer: { findUnique: jest.Mock<(...args: any[]) => any> };
  };
  let builder: { build: jest.Mock<(...args: any[]) => any> };
  let eventService: { verifyChain: jest.Mock<(...args: any[]) => any> };

  beforeEach(async () => {
    db = {
      acceptanceCertificate: { findUnique: jest.fn() },
      acceptanceRecord: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
      offerSnapshot: { findUniqueOrThrow: jest.fn() },
      signingEvent: { findFirst: jest.fn() },
      // Populated by stubs: used to return termsVersionAtCreation for metadata section
      offer: { findUnique: jest.fn<any>().mockResolvedValue({ termsVersionAtCreation: '1.1' }) },
    };
    builder = { build: jest.fn() };
    eventService = { verifyChain: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CertificateService,
        { provide: 'PRISMA', useValue: db },
        { provide: CertificatePayloadBuilder, useValue: builder },
        { provide: SigningEventService, useValue: eventService },
        { provide: DealEventService, useValue: { emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) } },
      ],
    }).compile();

    service = module.get(CertificateService);
  });

  // ── Stub helpers ─────────────────────────────────────────────────────────────

  // Legacy cert (canonicalHash=null). After Phase 1, these return:
  //   valid=false, integrityChecksPass=true (when hash+chain pass)
  // because LEGACY_CERTIFICATE advisory anomaly is present.
  function stubLegacyCert(storedHash: string) {
    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      offerId: OFFER_ID,
      acceptanceRecordId: RECORD_ID,
      issuedAt: ISSUED_AT,
      certificateHash: storedHash,
      canonicalHash: null,
    });
    db.acceptanceRecord.findUniqueOrThrow.mockResolvedValue({
      id: RECORD_ID,
      sessionId: SESSION_ID,
      snapshotId: 'snap-1',
      verifiedEmail: 'bob@client.com',
      acceptedAt: new Date('2024-06-01T11:59:00.000Z'),
      ipAddress: null,
      userAgent: null,
      acceptanceStatementVersion: '1.1',
    });
    const snapshotHashInput = {
      title: makePayload().offer.title,
      message: null as null,
      senderName: makePayload().sender.name,
      senderEmail: makePayload().sender.email,
      expiresAt: null as null,
      documents: [] as Array<{ filename: string; sha256Hash: string; storageKey: string }>,
    };
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue({
      id: 'snap-1',
      ...snapshotHashInput,
      contentHash: computeSnapshotHash(snapshotHashInput),
      documents: [],
    });
    // Legacy event — no acceptanceStatementHash in payload → statement check is N/A
    db.signingEvent.findFirst.mockResolvedValue({ payload: {} });
  }

  // Backward-compat alias used by legacy tests.
  const stubCert = stubLegacyCert;

  // Modern cert (canonicalHash computed from real evidence). All checks pass →
  // valid=true, integrityChecksPass=true, advisoryAnomalies=[].
  function stubModernCert(storedHash: string) {
    const acceptedAt = '2024-06-01T11:59:00.000Z';
    const { hash: canonicalHash } = computeCanonicalAcceptanceHash({
      acceptedAt,
      dealId: OFFER_ID,
      ipAddress: null,
      recipientEmail: 'bob@client.com',
      userAgent: null,
    });
    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      offerId: OFFER_ID,
      acceptanceRecordId: RECORD_ID,
      issuedAt: ISSUED_AT,
      certificateHash: storedHash,
      canonicalHash,
    });
    db.acceptanceRecord.findUniqueOrThrow.mockResolvedValue({
      id: RECORD_ID,
      sessionId: SESSION_ID,
      snapshotId: 'snap-1',
      verifiedEmail: 'bob@client.com',
      acceptedAt: new Date(acceptedAt),
      ipAddress: null,
      userAgent: null,
      acceptanceStatementVersion: '1.1',
    });
    const snapshotHashInput = {
      title: makePayload().offer.title,
      message: null as null,
      senderName: makePayload().sender.name,
      senderEmail: makePayload().sender.email,
      expiresAt: null as null,
      documents: [] as Array<{ filename: string; sha256Hash: string; storageKey: string }>,
    };
    db.offerSnapshot.findUniqueOrThrow.mockResolvedValue({
      id: 'snap-1',
      ...snapshotHashInput,
      contentHash: computeSnapshotHash(snapshotHashInput),
      documents: [],
    });
    // Modern event — no acceptanceStatementHash field yet (Phase 3 not emitted)
    db.signingEvent.findFirst.mockResolvedValue({ payload: {} });
  }

  // ── Phase 1 regression: modern cert (canonical hash set) returns valid=true ────
  it('returns valid=true when modern cert — hash, canonical hash, and event chain all intact', async () => {
    const built = makeBuiltCert();
    stubModernCert(built.certificateHash);
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(true);
    expect(result.integrityChecksPass).toBe(true);
    expect(result.certificateHashMatch).toBe(true);
    expect(result.canonicalHashMatch).toBe(true);
    expect(result.eventChainValid).toBe(true);
    expect(result.advisoryAnomalies).toHaveLength(0);
    expect(result.integrityAnomalies).toHaveLength(0);
    expect(result.brokenAtSequence).toBeUndefined();
  });

  // ── Phase 1 regression: legacy cert returns valid=false, integrityChecksPass=true ─
  it('legacy cert (canonicalHash=null) returns valid=false with integrityChecksPass=true', async () => {
    const built = makeBuiltCert();
    stubLegacyCert(built.certificateHash);
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    // Crypto checks all pass — no tampering detected
    expect(result.integrityChecksPass).toBe(true);
    expect(result.certificateHashMatch).toBe(true);
    expect(result.canonicalHashMatch).toBeUndefined(); // not checked for legacy certs
    expect(result.integrityAnomalies).toHaveLength(0);
    // Advisory anomaly for missing canonical hash makes valid=false
    expect(result.valid).toBe(false);
    expect(result.advisoryAnomalies).toHaveLength(1);
    expect(result.advisoryAnomalies[0]).toContain('LEGACY_CERTIFICATE');
    // Backward-compat union field
    expect(result.anomaliesDetected).toHaveLength(1);
  });

  it('returns valid=false when stored hash does not match recomputed hash', async () => {
    const built = makeBuiltCert();
    // Store a tampered hash
    stubCert('tampered' + '0'.repeat(57));
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.certificateHashMatch).toBe(false);
    expect(result.eventChainValid).toBe(true);
  });

  it('returns valid=false when event chain is broken', async () => {
    const built = makeBuiltCert();
    stubCert(built.certificateHash);
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: false, brokenAtSequence: 3 });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.certificateHashMatch).toBe(true);
    expect(result.eventChainValid).toBe(false);
    expect(result.brokenAtSequence).toBe(3);
  });

  it('returns valid=false when both hash and event chain are compromised', async () => {
    const built = makeBuiltCert();
    stubCert('tampered' + '0'.repeat(57));
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: false, brokenAtSequence: 1 });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.certificateHashMatch).toBe(false);
    expect(result.eventChainValid).toBe(false);
  });

  // ── Phase 1 regression: tampered modern cert — integrityChecksPass=false ──────
  it('modern cert with tampered hash returns valid=false, integrityChecksPass=false, integrityAnomalies non-empty', async () => {
    const built = makeBuiltCert();
    stubModernCert('tampered' + '0'.repeat(57)); // stored hash does not match recomputed
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.integrityChecksPass).toBe(false);
    expect(result.certificateHashMatch).toBe(false);
    expect(result.advisoryAnomalies).toHaveLength(0); // not a legacy cert
    expect(result.integrityAnomalies.length).toBeGreaterThan(0);
    expect(result.anomaliesDetected.length).toBeGreaterThan(0);
  });

  it('throws NotFoundException when certificate does not exist', async () => {
    db.acceptanceCertificate.findUnique.mockResolvedValue(null);

    await expect(service.verify(CERT_ID)).rejects.toThrow(NotFoundException);
  });

  it('passes the stored issuedAt (not a new Date) to the builder for hash recomputation', async () => {
    const built = makeBuiltCert();
    stubCert(built.certificateHash);
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    await service.verify(CERT_ID);

    // Builder must receive the stored issuedAt — not a freshly minted new Date()
    expect(builder.build).toHaveBeenCalledWith(RECORD_ID, CERT_ID, ISSUED_AT);
  });

  // ── Trust-layer metadata ──────────────────────────────────────────────────────

  it('verify() includes metadata with termsVersionAtCreation from Offer row', async () => {
    const built = makeBuiltCert();
    stubModernCert(built.certificateHash);
    // Override the default offer mock to return a specific terms version
    db.offer.findUnique.mockResolvedValue({ termsVersionAtCreation: '1.1' });
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.metadata).toBeDefined();
    expect(result.metadata.termsVersionAtCreation).toBe('1.1');
  });

  it('verify() includes metadata with acceptanceStatementVersion from AcceptanceRecord', async () => {
    const built = makeBuiltCert();
    stubModernCert(built.certificateHash);
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.metadata.acceptanceStatementVersion).toBe('1.1');
  });

  it('verify() includes evidenceModelVersion as a non-empty string', async () => {
    const built = makeBuiltCert();
    stubModernCert(built.certificateHash);
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(typeof result.metadata.evidenceModelVersion).toBe('string');
    expect(result.metadata.evidenceModelVersion.length).toBeGreaterThan(0);
  });

  it('verify() returns null termsVersionAtCreation when Offer row has no version (legacy offer)', async () => {
    const built = makeBuiltCert();
    stubModernCert(built.certificateHash);
    // Simulate a pre-migration offer that has no termsVersionAtCreation
    db.offer.findUnique.mockResolvedValue({ termsVersionAtCreation: null });
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.metadata.termsVersionAtCreation).toBeNull();
  });

  it('verify() returns null acceptanceStatementVersion for legacy acceptance records', async () => {
    const built = makeBuiltCert();
    // Use legacy stub (no acceptanceStatementVersion set), then override to null
    stubLegacyCert(built.certificateHash);
    db.acceptanceRecord.findUniqueOrThrow.mockResolvedValue({
      id: RECORD_ID,
      sessionId: SESSION_ID,
      snapshotId: 'snap-1',
      verifiedEmail: 'bob@client.com',
      acceptedAt: new Date('2024-06-01T11:59:00.000Z'),
      ipAddress: null,
      userAgent: null,
      acceptanceStatementVersion: null,  // legacy record
    });
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.metadata.acceptanceStatementVersion).toBeNull();
  });
});

// ─── CertificateService.generateForAcceptance() — idempotency ─────────────────

describe('CertificateService.generateForAcceptance()', () => {
  let service: CertificateService;
  let db: {
    acceptanceCertificate: { findUnique: jest.Mock<(...args: any[]) => any>; create: jest.Mock<(...args: any[]) => any> };
    acceptanceRecord: { findUniqueOrThrow: jest.Mock<(...args: any[]) => any>; findUnique: jest.Mock<(...args: any[]) => any> };
  };
  let builder: { build: jest.Mock<(...args: any[]) => any> };
  let eventService: { verifyChain: jest.Mock<(...args: any[]) => any> };

  beforeEach(async () => {
    db = {
      acceptanceCertificate: { findUnique: jest.fn(), create: jest.fn() },
      acceptanceRecord: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    };
    builder = { build: jest.fn() };
    eventService = { verifyChain: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CertificateService,
        { provide: 'PRISMA', useValue: db },
        { provide: CertificatePayloadBuilder, useValue: builder },
        { provide: SigningEventService, useValue: eventService },
        { provide: DealEventService, useValue: { emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) } },
      ],
    }).compile();

    service = module.get(CertificateService);
  });

  it('returns existing certificateId without hitting the builder when already exists', async () => {
    db.acceptanceCertificate.findUnique.mockResolvedValue({ id: 'existing-cert' });

    const result = await service.generateForAcceptance(RECORD_ID);

    expect(result.certificateId).toBe('existing-cert');
    expect(builder.build).not.toHaveBeenCalled();
    expect(db.acceptanceCertificate.create).not.toHaveBeenCalled();
  });

  it('creates a new certificate when none exists', async () => {
    db.acceptanceCertificate.findUnique.mockResolvedValue(null);
    db.acceptanceRecord.findUniqueOrThrow.mockResolvedValue({
      id: RECORD_ID,
      snapshotId: 'snap-1',
      snapshot: { offerId: 'offer-1' },
      verifiedEmail: 'bob@client.com',
      acceptedAt: new Date('2024-06-01T11:59:00.000Z'),
      ipAddress: null,
      userAgent: null,
    });
    // include: offer is needed for access control in exportPayload, but
    // generateForAcceptance bypasses exportPayload — uses db.acceptanceCertificate.create directly

    const built = makeBuiltCert();
    builder.build.mockResolvedValue(built);
    db.acceptanceCertificate.create.mockImplementation((args: unknown) =>
      Promise.resolve({ id: (args as { data: { id: string } }).data.id }),
    );

    const result = await service.generateForAcceptance(RECORD_ID);

    expect(typeof result.certificateId).toBe('string');
    expect(db.acceptanceCertificate.create).toHaveBeenCalledTimes(1);

    const createArgs = ((db.acceptanceCertificate.create as jest.Mock).mock.calls as unknown[][])[0][0] as {
      data: { certificateHash: string; offerId: string; acceptanceRecordId: string };
    };
    expect(createArgs.data.certificateHash).toBe(built.certificateHash);
    expect(createArgs.data.offerId).toBe('offer-1');
    expect(createArgs.data.acceptanceRecordId).toBe(RECORD_ID);
  });
});

// ─── CertificateService.exportPayload() — metadata ────────────────────────────
// Verifies that exportPayload() attaches the correct metadata section sourced
// from Offer.termsVersionAtCreation and AcceptanceRecord.acceptanceStatementVersion.

describe('CertificateService.exportPayload() — metadata', () => {
  let service: CertificateService;
  let db: {
    acceptanceCertificate: { findUnique: jest.Mock<(...args: any[]) => any> };
    signingEvent: { findMany: jest.Mock<(...args: any[]) => any> };
  };
  let builder: { build: jest.Mock<(...args: any[]) => any> };

  beforeEach(async () => {
    db = {
      acceptanceCertificate: { findUnique: jest.fn() },
      signingEvent: { findMany: jest.fn<any>().mockResolvedValue([]) },
    };
    builder = { build: jest.fn<any>().mockResolvedValue(makeBuiltCert()) };

    const module = await Test.createTestingModule({
      providers: [
        CertificateService,
        { provide: 'PRISMA', useValue: db },
        { provide: CertificatePayloadBuilder, useValue: builder },
        { provide: SigningEventService, useValue: { verifyChain: jest.fn() } },
        { provide: DealEventService, useValue: { emit: () => Promise.resolve() } },
      ],
    }).compile();

    service = module.get(CertificateService);
  });

  function stubExportCert(opts: { termsVersionAtCreation?: string | null; acceptanceStatementVersion?: string | null } = {}) {
    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      offerId: OFFER_ID,
      acceptanceRecordId: RECORD_ID,
      issuedAt: ISSUED_AT,
      certificateHash: makeBuiltCert().certificateHash,
      offer: {
        organizationId: 'org-1',
        // Use !== undefined so that explicit null is preserved (null ?? fallback = fallback)
        termsVersionAtCreation: opts.termsVersionAtCreation !== undefined ? opts.termsVersionAtCreation : '1.1',
      },
      acceptanceRecord: {
        sessionId: SESSION_ID,
        acceptanceStatementVersion: opts.acceptanceStatementVersion !== undefined ? opts.acceptanceStatementVersion : '1.1',
      },
    });
  }

  it('exportPayload() includes metadata with termsVersionAtCreation from Offer row', async () => {
    stubExportCert({ termsVersionAtCreation: '1.1' });
    const result = await service.exportPayload(CERT_ID, 'org-1', 'OWNER');
    expect(result.metadata).toBeDefined();
    expect(result.metadata.termsVersionAtCreation).toBe('1.1');
  });

  it('exportPayload() includes metadata with acceptanceStatementVersion from AcceptanceRecord', async () => {
    stubExportCert({ acceptanceStatementVersion: '1.1' });
    const result = await service.exportPayload(CERT_ID, 'org-1', 'OWNER');
    expect(result.metadata.acceptanceStatementVersion).toBe('1.1');
  });

  it('exportPayload() includes a non-empty evidenceModelVersion', async () => {
    stubExportCert();
    const result = await service.exportPayload(CERT_ID, 'org-1', 'OWNER');
    expect(typeof result.metadata.evidenceModelVersion).toBe('string');
    expect(result.metadata.evidenceModelVersion.length).toBeGreaterThan(0);
  });

  it('exportPayload() returns null for termsVersionAtCreation on pre-migration offers', async () => {
    stubExportCert({ termsVersionAtCreation: null });
    const result = await service.exportPayload(CERT_ID, 'org-1', 'OWNER');
    expect(result.metadata.termsVersionAtCreation).toBeNull();
  });

  it('exportPayload() returns null for acceptanceStatementVersion on legacy records', async () => {
    stubExportCert({ acceptanceStatementVersion: null });
    const result = await service.exportPayload(CERT_ID, 'org-1', 'OWNER');
    expect(result.metadata.acceptanceStatementVersion).toBeNull();
  });
});

// ─── CertificateService.getExportForJob() — Phase 5 (MEDIUM-6) ────────────────
// Verifies that the certificateHash returned in the export payload is the value
// RECOMPUTED by the builder from current evidence, NOT the raw stored value.
// A tampered stored hash must not appear in the exported payload.

describe('CertificateService.getExportForJob()', () => {
  let service: CertificateService;
  let db: {
    acceptanceCertificate: { findUnique: jest.Mock<(...args: any[]) => any> };
  };
  let builder: { build: jest.Mock<(...args: any[]) => any> };

  beforeEach(async () => {
    db = {
      acceptanceCertificate: { findUnique: jest.fn() },
    };
    builder = { build: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CertificateService,
        { provide: 'PRISMA', useValue: db },
        { provide: CertificatePayloadBuilder, useValue: builder },
        { provide: SigningEventService, useValue: { verifyChain: jest.fn() } },
        { provide: DealEventService, useValue: { emit: () => Promise.resolve() } },
      ],
    }).compile();

    service = module.get(CertificateService);
  });

  it('returns recomputed certificateHash from builder, not the stored value', async () => {
    const storedHash   = 'stored-' + '0'.repeat(57);  // tampered or stale stored value
    const recomputedHash = makeBuiltCert().certificateHash;   // correct recomputed value

    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      acceptanceRecordId: RECORD_ID,
      issuedAt: ISSUED_AT,
      certificateHash: storedHash,   // stored (potentially tampered)
      pdfStorageKey: null,
    });

    const built = makeBuiltCert();
    builder.build.mockResolvedValue(built);

    const result = await service.getExportForJob(CERT_ID);

    // Must return the recomputed hash, not the potentially-tampered stored one
    expect(result.certificateHash).toBe(recomputedHash);
    expect(result.certificateHash).not.toBe(storedHash);
  });
});
