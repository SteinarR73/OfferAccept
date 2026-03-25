import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { CertificatePayloadBuilder, computeCertificateHash } from '../../src/modules/certificates/certificate-payload.builder';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import { computeSnapshotHash } from '../../src/modules/signing/domain/signing-event.builder';

// ─── Certificate access control tests ─────────────────────────────────────────
//
// Verifies that:
//   1. Same-org callers can access certificate export
//   2. Cross-org callers are rejected with ForbiddenException
//   3. INTERNAL_SUPPORT callers can access any certificate
//   4. The public verify() endpoint returns only integrity data (no sensitive payload)
//
// These tests exercise the service-level authorization enforced in exportPayload().

const CERT_ID = 'cert-access-1';
const RECORD_ID = 'record-access-1';
const ISSUED_AT = new Date('2024-07-01T12:00:00.000Z');
const OWNER_ORG_ID = 'org-owner';
const OTHER_ORG_ID = 'org-other';

function makePayload() {
  return {
    certificateId: CERT_ID,
    issuedAt: ISSUED_AT.toISOString(),
    issuer: 'OfferAccept' as const,
    issuerVersion: '1.0' as const,
    offer: {
      title: 'Access Control Test Offer',
      message: null,
      expiresAt: null,
      sentAt: '2024-06-30T10:00:00.000Z',
      snapshotContentHash: 'b'.repeat(64),
    },
    sender: { name: 'Corp', email: 'corp@co.com' },
    recipient: { name: 'Client', verifiedEmail: 'client@client.com' },
    documents: [],
    acceptance: {
      statement: 'I accept.',
      acceptedAt: '2024-07-01T11:59:00.000Z',
      verifiedEmail: 'client@client.com',
      emailVerifiedAt: '2024-07-01T11:55:00.000Z',
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

// ─── Test setup ────────────────────────────────────────────────────────────────

type AnyMock = jest.Mock<(...args: any[]) => any>;
type MockDb = {
  acceptanceCertificate: { findUnique: AnyMock; create: AnyMock };
  acceptanceRecord: { findUniqueOrThrow: AnyMock; findUnique: AnyMock };
  offerSnapshot: { findUniqueOrThrow: AnyMock };
};

function makeMockDb(): MockDb {
  return {
    acceptanceCertificate: { findUnique: jest.fn(), create: jest.fn() },
    acceptanceRecord: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    offerSnapshot: { findUniqueOrThrow: jest.fn() },
  };
}

// The findUnique for acceptanceCertificate must include offer.organizationId
function stubCertWithOrg(db: MockDb, orgId: string, storedHash: string) {
  db.acceptanceCertificate.findUnique.mockResolvedValue({
    id: CERT_ID,
    acceptanceRecordId: RECORD_ID,
    issuedAt: ISSUED_AT,
    certificateHash: storedHash,
    acceptanceRecord: { id: RECORD_ID, sessionId: 'session-1', snapshotId: 'snap-1' },
    offer: { organizationId: orgId },
  });
}

async function buildService(db: MockDb, builder: { build: AnyMock }, eventService: { verifyChain: AnyMock }) {
  const module = await Test.createTestingModule({
    providers: [
      CertificateService,
      { provide: 'PRISMA', useValue: db },
      { provide: CertificatePayloadBuilder, useValue: builder },
      { provide: SigningEventService, useValue: eventService },
      { provide: DealEventService, useValue: { emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) } },
    ],
  }).compile();
  return module.get(CertificateService);
}

// ─── exportPayload access control ─────────────────────────────────────────────

describe('CertificateService.exportPayload() — access control', () => {
  let db: MockDb;
  let builder: { build: AnyMock };
  let eventService: { verifyChain: AnyMock };
  let service: CertificateService;

  beforeEach(async () => {
    db = makeMockDb();
    builder = { build: jest.fn() };
    eventService = { verifyChain: jest.fn() };
    service = await buildService(db, builder, eventService);
  });

  it('allows access when callerOrgId matches the certificate owning org', async () => {
    const built = makeBuiltCert();
    stubCertWithOrg(db, OWNER_ORG_ID, built.certificateHash);
    builder.build.mockResolvedValue(built);

    const result = await service.exportPayload(CERT_ID, OWNER_ORG_ID, 'OWNER');

    expect(result.certificateId).toBe(CERT_ID);
    expect(result.payload.offer.title).toBe('Access Control Test Offer');
  });

  it('allows access for INTERNAL_SUPPORT regardless of org', async () => {
    const built = makeBuiltCert();
    // INTERNAL_SUPPORT from a completely different org
    stubCertWithOrg(db, OWNER_ORG_ID, built.certificateHash);
    builder.build.mockResolvedValue(built);

    const result = await service.exportPayload(CERT_ID, 'internal-org', 'INTERNAL_SUPPORT');

    expect(result.certificateId).toBe(CERT_ID);
  });

  it('allows access for ADMIN in the owning org', async () => {
    const built = makeBuiltCert();
    stubCertWithOrg(db, OWNER_ORG_ID, built.certificateHash);
    builder.build.mockResolvedValue(built);

    const result = await service.exportPayload(CERT_ID, OWNER_ORG_ID, 'ADMIN');

    expect(result.certificateId).toBe(CERT_ID);
  });

  it('rejects access when callerOrgId belongs to a different organization', async () => {
    const built = makeBuiltCert();
    stubCertWithOrg(db, OWNER_ORG_ID, built.certificateHash);
    builder.build.mockResolvedValue(built);

    await expect(service.exportPayload(CERT_ID, OTHER_ORG_ID, 'OWNER'))
      .rejects.toThrow(ForbiddenException);
  });

  it('rejects MEMBER from a different org', async () => {
    const built = makeBuiltCert();
    stubCertWithOrg(db, OWNER_ORG_ID, built.certificateHash);
    builder.build.mockResolvedValue(built);

    await expect(service.exportPayload(CERT_ID, OTHER_ORG_ID, 'MEMBER'))
      .rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException before access check when cert does not exist', async () => {
    db.acceptanceCertificate.findUnique.mockResolvedValue(null);

    // Cross-org caller — but cert not found means 404, not 403
    await expect(service.exportPayload(CERT_ID, OTHER_ORG_ID, 'OWNER'))
      .rejects.toThrow(NotFoundException);
  });
});

// ─── verify() — public endpoint safety ────────────────────────────────────────
//
// The verify() method is used by the public endpoint. It must:
//   - Require no auth context (no caller org/role params)
//   - Return ONLY: valid (bool), hash match (bool), reconstructed/stored hashes,
//     snapshot integrity (bool), event chain validity (bool), anomalies (string[])
//   - NOT expose: acceptance statement, email addresses, IP addresses, payload content

describe('CertificateService.verify() — public endpoint safety', () => {
  let db: MockDb;
  let builder: { build: AnyMock };
  let eventService: { verifyChain: AnyMock };
  let service: CertificateService;

  beforeEach(async () => {
    db = makeMockDb();
    builder = { build: jest.fn() };
    eventService = { verifyChain: jest.fn() };
    service = await buildService(db, builder, eventService);
  });

  it('verify() takes no caller context — accessible without auth', async () => {
    const built = makeBuiltCert();
    // verify() uses its own findUnique without the org include
    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      acceptanceRecordId: RECORD_ID,
      issuedAt: ISSUED_AT,
      certificateHash: built.certificateHash,
      acceptanceRecord: { id: RECORD_ID, sessionId: 'session-1', snapshotId: 'snap-1' },
    });
    builder.build.mockResolvedValue(built);

    // Stub snapshot check inside verify()
    const snapshotInput = {
      title: 'Access Control Test Offer',
      message: null as null,
      senderName: 'Corp',
      senderEmail: 'corp@co.com',
      expiresAt: null as null,
      documents: [] as Array<{ filename: string; sha256Hash: string; storageKey: string }>,
    };
    db.offerSnapshot =
      { findUniqueOrThrow: (jest.fn() as AnyMock).mockResolvedValue({
        id: 'snap-1',
        ...snapshotInput,
        contentHash: computeSnapshotHash(snapshotInput),
        documents: [],
      }) };

    eventService.verifyChain.mockResolvedValue({ valid: true });

    // verify() signature has no callerOrgId/callerRole — this is by design
    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(true);
    expect(result.certificateHashMatch).toBe(true);
    expect(result.eventChainValid).toBe(true);

    // Verify that the return type does not contain any sensitive fields.
    // The payload returned should NOT include acceptance statement, email addresses,
    // or IP addresses. The VerificationResult interface enforces this at compile time,
    // but we double-check the runtime shape here.
    const resultKeys = Object.keys(result);
    expect(resultKeys).toContain('valid');
    expect(resultKeys).toContain('certificateHashMatch');
    expect(resultKeys).toContain('reconstructedHash');
    expect(resultKeys).toContain('storedHash');
    expect(resultKeys).toContain('snapshotIntegrity');
    expect(resultKeys).toContain('eventChainValid');
    expect(resultKeys).toContain('anomaliesDetected');

    // Sensitive fields must NOT appear in the verification result
    expect(resultKeys).not.toContain('acceptanceStatement');
    expect(resultKeys).not.toContain('verifiedEmail');
    expect(resultKeys).not.toContain('ipAddress');
    expect(resultKeys).not.toContain('userAgent');
    expect(resultKeys).not.toContain('payload');
    expect(resultKeys).not.toContain('canonicalJson');
  });
});
