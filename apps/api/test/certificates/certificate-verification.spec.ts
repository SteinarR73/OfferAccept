import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { CertificatePayloadBuilder, computeCertificateHash } from '../../src/modules/certificates/certificate-payload.builder';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CERT_ID = 'cert-1';
const RECORD_ID = 'record-1';
const ISSUED_AT = new Date('2024-06-01T12:00:00.000Z');
const SESSION_ID = 'session-1';

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
  let db: { acceptanceCertificate: { findUnique: jest.Mock }; acceptanceRecord: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock } };
  let builder: { build: jest.Mock };
  let eventService: { verifyChain: jest.Mock };

  beforeEach(async () => {
    db = {
      acceptanceCertificate: { findUnique: jest.fn() },
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
      ],
    }).compile();

    service = module.get(CertificateService);
  });

  function stubCert(storedHash: string) {
    db.acceptanceCertificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      acceptanceRecordId: RECORD_ID,
      issuedAt: ISSUED_AT,
      certificateHash: storedHash,
      acceptanceRecord: { id: RECORD_ID, sessionId: SESSION_ID },
    });
  }

  it('returns valid=true when hash and event chain are both intact', async () => {
    const built = makeBuiltCert();
    stubCert(built.certificateHash);
    builder.build.mockResolvedValue(built);
    eventService.verifyChain.mockResolvedValue({ valid: true });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(true);
    expect(result.certificateHashMatch).toBe(true);
    expect(result.eventChainValid).toBe(true);
    expect(result.brokenAtSequence).toBeUndefined();
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
});

// ─── CertificateService.generateForAcceptance() — idempotency ─────────────────

describe('CertificateService.generateForAcceptance()', () => {
  let service: CertificateService;
  let db: {
    acceptanceCertificate: { findUnique: jest.Mock; create: jest.Mock };
    acceptanceRecord: { findUniqueOrThrow: jest.Mock; findUnique: jest.Mock };
  };
  let builder: { build: jest.Mock };
  let eventService: { verifyChain: jest.Mock };

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
      snapshot: { offerId: 'offer-1' },
    });

    const built = makeBuiltCert();
    builder.build.mockResolvedValue(built);
    db.acceptanceCertificate.create.mockImplementation(({ data }: { data: { id: string } }) =>
      Promise.resolve({ id: data.id }),
    );

    const result = await service.generateForAcceptance(RECORD_ID);

    expect(typeof result.certificateId).toBe('string');
    expect(db.acceptanceCertificate.create).toHaveBeenCalledTimes(1);

    const createArgs = (db.acceptanceCertificate.create as jest.Mock).mock.calls[0][0] as {
      data: { certificateHash: string; offerId: string; acceptanceRecordId: string };
    };
    expect(createArgs.data.certificateHash).toBe(built.certificateHash);
    expect(createArgs.data.offerId).toBe('offer-1');
    expect(createArgs.data.acceptanceRecordId).toBe(RECORD_ID);
  });
});
