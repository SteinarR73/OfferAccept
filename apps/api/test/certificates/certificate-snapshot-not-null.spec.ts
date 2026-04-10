/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { CertificatePayloadBuilder, computeCertificateHash } from '../../src/modules/certificates/certificate-payload.builder';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';

// ─── P1-5: AcceptanceCertificate.snapshotId NOT NULL enforcement ───────────────
//
// Tests verify:
//   1. snapshotId is always written to the DB row on successful certificate creation
//   2. The service throws (not silently nulls) when AcceptanceRecord.snapshotId is absent
//   3. The idempotency guard returns early without calling db.create on re-runs
//   4. A race-condition P2002 retry returns the winner's certificate

type AnyMock = jest.Mock<(...args: any[]) => any>;

const CERT_ID     = 'cert-snapshot-1';
const RECORD_ID   = 'record-snapshot-1';
const SNAPSHOT_ID = 'snap-snapshot-1';
const OFFER_ID    = 'offer-snapshot-1';
const ISSUED_AT   = new Date('2025-01-15T10:00:00.000Z');

function makePayload() {
  return {
    certificateId: CERT_ID,
    issuedAt: ISSUED_AT.toISOString(),
    issuer: 'OfferAccept' as const,
    issuerVersion: '1.0' as const,
    offer: {
      title: 'P1-5 Test Offer',
      message: null,
      expiresAt: null,
      sentAt: '2025-01-14T08:00:00.000Z',
      snapshotContentHash: 'a'.repeat(64),
    },
    sender:    { name: 'Alice', email: 'alice@co.com' },
    recipient: { name: 'Bob',   verifiedEmail: 'bob@co.com' },
    documents: [] as never[],
    acceptance: {
      statement:       'I accept.',
      acceptedAt:      '2025-01-15T09:59:00.000Z',
      verifiedEmail:   'bob@co.com',
      emailVerifiedAt: '2025-01-15T09:55:00.000Z',
      ipAddress:       '10.0.0.1',
      userAgent:       'TestAgent/1.0',
      locale:          'en-US',
      timezone:        'UTC',
    },
  };
}

type MockDb = {
  acceptanceCertificate: { findUnique: AnyMock; findUniqueOrThrow?: AnyMock; create: AnyMock };
  acceptanceRecord: { findUniqueOrThrow: AnyMock };
  offerSnapshot: { findUniqueOrThrow: AnyMock };
  signingEvent: { findMany: AnyMock };
};

function makeMockDb(): MockDb {
  return {
    acceptanceCertificate: {
      findUnique: jest.fn() as AnyMock,
      create: jest.fn() as AnyMock,
    },
    acceptanceRecord: { findUniqueOrThrow: jest.fn() as AnyMock },
    offerSnapshot: { findUniqueOrThrow: jest.fn() as AnyMock },
    signingEvent: { findMany: (jest.fn() as AnyMock).mockResolvedValue([]) as AnyMock },
  };
}

// Stubs the two sequential findUniqueOrThrow calls inside generateForAcceptance():
//   call 1 — record with snapshotId + snapshot.offerId
//   call 2 — record fields for canonical hash computation
function stubRecord(db: MockDb, snapshotId: string | null = SNAPSHOT_ID) {
  (db.acceptanceRecord.findUniqueOrThrow as AnyMock)
    .mockResolvedValueOnce({
      id: RECORD_ID,
      snapshotId,
      snapshot: { offerId: OFFER_ID },
    })
    .mockResolvedValueOnce({
      verifiedEmail: 'bob@co.com',
      acceptedAt:    new Date('2025-01-15T09:59:00.000Z'),
      ipAddress:     '10.0.0.1',
      userAgent:     'TestAgent/1.0',
    });
}

async function buildService(db: MockDb) {
  const payload = makePayload();
  const { hash, canonical } = computeCertificateHash(payload);
  const builder = {
    build: (jest.fn() as AnyMock).mockResolvedValue({ payload, certificateHash: hash, canonicalJson: canonical }),
  };

  const module = await Test.createTestingModule({
    providers: [
      CertificateService,
      { provide: 'PRISMA', useValue: db },
      { provide: CertificatePayloadBuilder, useValue: builder },
      { provide: SigningEventService, useValue: { verifyChain: (jest.fn() as AnyMock).mockResolvedValue(true) } },
      {
        provide: DealEventService,
        useValue: {
          emit: (jest.fn() as AnyMock).mockResolvedValue(undefined),
          getForDeal: (jest.fn() as AnyMock).mockResolvedValue([]),
          getRecentForOrg: (jest.fn() as AnyMock).mockResolvedValue([]),
        },
      },
    ],
  }).compile();

  return module.get(CertificateService);
}

// ── snapshotId is always written ───────────────────────────────────────────────

describe('AcceptanceCertificate.snapshotId — written on creation', () => {
  it('passes snapshotId to db.create when AcceptanceRecord has snapshotId', async () => {
    const db = makeMockDb();
    stubRecord(db);
    (db.acceptanceCertificate.findUnique as AnyMock).mockResolvedValue(null);
    (db.acceptanceCertificate.create as AnyMock).mockResolvedValue({ id: CERT_ID, certificateHash: 'h', snapshotId: SNAPSHOT_ID });

    const service = await buildService(db);
    await service.generateForAcceptance(RECORD_ID);

    expect(db.acceptanceCertificate.create).toHaveBeenCalledTimes(1);
    const callArg = (db.acceptanceCertificate.create as AnyMock).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data['snapshotId']).toBe(SNAPSHOT_ID);
  });

  it('snapshotId in db.create data matches the AcceptanceRecord.snapshotId', async () => {
    const customSnapshotId = 'snap-custom-xyz';
    const db = makeMockDb();
    (db.acceptanceRecord.findUniqueOrThrow as AnyMock)
      .mockResolvedValueOnce({ id: RECORD_ID, snapshotId: customSnapshotId, snapshot: { offerId: OFFER_ID } })
      .mockResolvedValueOnce({ verifiedEmail: 'bob@co.com', acceptedAt: new Date(), ipAddress: null, userAgent: null });
    (db.acceptanceCertificate.findUnique as AnyMock).mockResolvedValue(null);
    (db.acceptanceCertificate.create as AnyMock).mockResolvedValue({ id: CERT_ID, certificateHash: 'h' });

    const service = await buildService(db);
    await service.generateForAcceptance(RECORD_ID);

    const createData = ((db.acceptanceCertificate.create as AnyMock).mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(createData['snapshotId']).toBe(customSnapshotId);
  });
});

// ── Missing snapshotId throws ──────────────────────────────────────────────────

describe('AcceptanceCertificate.snapshotId — throws when AcceptanceRecord.snapshotId is absent', () => {
  it('throws an Error with a descriptive message when snapshotId is null', async () => {
    const db = makeMockDb();
    stubRecord(db, null);
    (db.acceptanceCertificate.findUnique as AnyMock).mockResolvedValue(null);

    const service = await buildService(db);
    await expect(service.generateForAcceptance(RECORD_ID)).rejects.toThrow(
      /snapshotId.*cannot generate certificate/,
    );
  });

  it('does not call db.create when AcceptanceRecord.snapshotId is null', async () => {
    const db = makeMockDb();
    stubRecord(db, null);
    (db.acceptanceCertificate.findUnique as AnyMock).mockResolvedValue(null);

    const service = await buildService(db);
    await expect(service.generateForAcceptance(RECORD_ID)).rejects.toThrow();
    expect(db.acceptanceCertificate.create).not.toHaveBeenCalled();
  });
});

// ── Idempotency guard ──────────────────────────────────────────────────────────

describe('AcceptanceCertificate.snapshotId — idempotency guard returns early', () => {
  it('returns existing certificate without calling db.create', async () => {
    const db = makeMockDb();
    (db.acceptanceCertificate.findUnique as AnyMock).mockResolvedValue({ id: CERT_ID, certificateHash: 'existing-hash' });

    const service = await buildService(db);
    const result = await service.generateForAcceptance(RECORD_ID);

    expect(db.acceptanceCertificate.create).not.toHaveBeenCalled();
    expect(result.certificateId).toBe(CERT_ID);
    expect(result.certificateHash).toBe('existing-hash');
  });
});

// ── Race condition P2002 retry ─────────────────────────────────────────────────

describe('AcceptanceCertificate.snapshotId — P2002 race retry', () => {
  it('returns winner certificate when create throws P2002', async () => {
    const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');
    const db = makeMockDb();
    stubRecord(db);
    (db.acceptanceCertificate.findUnique as AnyMock).mockResolvedValue(null);

    const p2002 = new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    (db.acceptanceCertificate.create as AnyMock).mockRejectedValue(p2002);

    // The service calls findUniqueOrThrow (not findUnique) in the P2002 catch
    db.acceptanceCertificate.findUniqueOrThrow = (jest.fn() as AnyMock).mockResolvedValue({
      id: 'cert-winner',
      certificateHash: 'winner-hash',
    });

    const service = await buildService(db);
    const result = await service.generateForAcceptance(RECORD_ID);

    expect(result.certificateId).toBe('cert-winner');
    expect(result.certificateHash).toBe('winner-hash');
  });
});
