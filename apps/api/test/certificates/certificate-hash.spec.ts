import { jest } from '@jest/globals';
import {
  CertificatePayloadBuilder,
  CertificatePayload,
  computeCertificateHash,
} from '../../src/modules/certificates/certificate-payload.builder';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const ISSUED_AT = new Date('2024-06-01T12:00:00.000Z');
const CERTIFICATE_ID = 'cert-abc-123';
const RECORD_ID = 'record-1';

function makePayload(overrides: Partial<CertificatePayload> = {}): CertificatePayload {
  return {
    certificateId: CERTIFICATE_ID,
    issuedAt: ISSUED_AT.toISOString(),
    issuer: 'OfferAccept',
    issuerVersion: '1.0',
    offer: {
      title: 'Web Redesign Proposal',
      message: 'Please review.',
      expiresAt: null,
      sentAt: '2024-05-31T10:00:00.000Z',
      snapshotContentHash: 'a'.repeat(64),
    },
    sender: { name: 'Alice Sender', email: 'alice@co.com' },
    recipient: { name: 'Bob Client', verifiedEmail: 'bob@client.com' },
    documents: [],
    acceptance: {
      statement: 'I, Bob Client, agree.',
      acceptedAt: '2024-06-01T11:59:00.000Z',
      verifiedEmail: 'bob@client.com',
      emailVerifiedAt: '2024-06-01T11:55:00.000Z',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      locale: 'en-US',
      timezone: 'America/New_York',
    },
    ...overrides,
  };
}

// ─── computeCertificateHash — pure function tests ─────────────────────────────

describe('computeCertificateHash', () => {
  it('produces identical hashes for identical payloads', () => {
    const p = makePayload();
    const r1 = computeCertificateHash(p);
    const r2 = computeCertificateHash(p);
    expect(r1.hash).toBe(r2.hash);
    expect(r1.canonical).toBe(r2.canonical);
  });

  it('produces a 64-character hex SHA-256 hash', () => {
    const { hash } = computeCertificateHash(makePayload());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is key-order independent — same content, different key order → same hash', () => {
    const p1 = makePayload();
    // Rebuild with reversed keys in acceptance to confirm deep sort
    const p2: CertificatePayload = {
      ...makePayload(),
      acceptance: {
        userAgent: 'Mozilla/5.0',
        timezone: 'America/New_York',
        locale: 'en-US',
        ipAddress: '1.2.3.4',
        emailVerifiedAt: '2024-06-01T11:55:00.000Z',
        verifiedEmail: 'bob@client.com',
        acceptedAt: '2024-06-01T11:59:00.000Z',
        statement: 'I, Bob Client, agree.',
      },
    };
    expect(computeCertificateHash(p1).hash).toBe(computeCertificateHash(p2).hash);
  });

  it('produces a different hash when any field changes', () => {
    const base = computeCertificateHash(makePayload());

    const cases: Partial<CertificatePayload>[] = [
      { certificateId: 'cert-different' },
      { issuedAt: '2024-06-01T12:00:01.000Z' },
      { sender: { name: 'Changed Name', email: 'alice@co.com' } },
      { recipient: { name: 'Bob Client', verifiedEmail: 'changed@client.com' } },
    ];

    for (const override of cases) {
      const mutated = computeCertificateHash(makePayload(override));
      expect(mutated.hash).not.toBe(base.hash);
    }
  });

  it('produces a different hash when a document is added', () => {
    const base = computeCertificateHash(makePayload());
    const withDoc = computeCertificateHash(
      makePayload({
        documents: [
          { filename: 'proposal.pdf', mimeType: 'application/pdf', sizeBytes: 1024, sha256Hash: 'b'.repeat(64) },
        ],
      }),
    );
    expect(withDoc.hash).not.toBe(base.hash);
  });
});

// ─── CertificatePayloadBuilder.build() — determinism with issuedAt ────────────

describe('CertificatePayloadBuilder.build()', () => {
  function makeDb() {
    const snapshot = {
      id: 'snapshot-1',
      offerId: 'offer-1',
      title: 'Web Redesign Proposal',
      message: 'Please review.',
      senderName: 'Alice Sender',
      senderEmail: 'alice@co.com',
      expiresAt: null,
      frozenAt: new Date('2024-05-31T10:00:00.000Z'),
      contentHash: 'a'.repeat(64),
      documents: [
        {
          id: 'doc-1',
          storageKey: 'uploads/org-1/proposal.pdf',
          filename: 'proposal.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256Hash: 'b'.repeat(64),
        },
      ],
    };

    const record = {
      id: RECORD_ID,
      recipientId: 'recipient-1',
      snapshotId: 'snapshot-1',
      acceptanceStatement: 'I, Bob Client, agree.',
      verifiedEmail: 'bob@client.com',
      emailVerifiedAt: new Date('2024-06-01T11:55:00.000Z'),
      acceptedAt: new Date('2024-06-01T11:59:00.000Z'),
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      locale: 'en-US',
      timezone: 'America/New_York',
      snapshot,
    };

    const recipient = {
      id: 'recipient-1',
      name: 'Bob Client',
      email: 'bob@client.com',
    };

    const db = {
      acceptanceRecord: {
        findUniqueOrThrow: jest.fn<() => Promise<typeof record>>().mockResolvedValue(record),
      },
      offerRecipient: {
        findUniqueOrThrow: jest.fn<() => Promise<typeof recipient>>().mockResolvedValue(recipient),
      },
    };

    return db;
  }

  it('produces the same hash when called twice with the same issuedAt', async () => {
    const db = makeDb();
    const builder = new CertificatePayloadBuilder(db as never);

    const r1 = await builder.build(RECORD_ID, CERTIFICATE_ID, ISSUED_AT);
    const r2 = await builder.build(RECORD_ID, CERTIFICATE_ID, ISSUED_AT);

    expect(r1.certificateHash).toBe(r2.certificateHash);
    expect(r1.canonicalJson).toBe(r2.canonicalJson);
  });

  it('produces a different hash when issuedAt differs by one millisecond', async () => {
    const db = makeDb();
    const builder = new CertificatePayloadBuilder(db as never);

    const r1 = await builder.build(RECORD_ID, CERTIFICATE_ID, ISSUED_AT);
    const r2 = await builder.build(RECORD_ID, CERTIFICATE_ID, new Date(ISSUED_AT.getTime() + 1));

    expect(r1.certificateHash).not.toBe(r2.certificateHash);
  });

  it('embeds the certificateId and issuedAt in the payload', async () => {
    const db = makeDb();
    const builder = new CertificatePayloadBuilder(db as never);
    const result = await builder.build(RECORD_ID, CERTIFICATE_ID, ISSUED_AT);

    expect(result.payload.certificateId).toBe(CERTIFICATE_ID);
    expect(result.payload.issuedAt).toBe(ISSUED_AT.toISOString());
  });

  it('sorts documents by storageKey for deterministic ordering', async () => {
    const db = makeDb();
    // Override documents to be in reverse alphabetical order
    const record = (db.acceptanceRecord.findUniqueOrThrow as jest.Mock).getMockImplementation?.();
    (db.acceptanceRecord.findUniqueOrThrow as jest.Mock<(...args: any[]) => any>).mockResolvedValue({
      id: RECORD_ID,
      recipientId: 'recipient-1',
      snapshotId: 'snapshot-1',
      acceptanceStatement: 'I, Bob Client, agree.',
      verifiedEmail: 'bob@client.com',
      emailVerifiedAt: new Date('2024-06-01T11:55:00.000Z'),
      acceptedAt: new Date('2024-06-01T11:59:00.000Z'),
      ipAddress: null,
      userAgent: null,
      locale: null,
      timezone: null,
      snapshot: {
        id: 'snapshot-1',
        offerId: 'offer-1',
        title: 'Web Redesign Proposal',
        message: null,
        senderName: 'Alice Sender',
        senderEmail: 'alice@co.com',
        expiresAt: null,
        frozenAt: new Date('2024-05-31T10:00:00.000Z'),
        contentHash: 'a'.repeat(64),
        documents: [
          { id: 'd2', storageKey: 'uploads/z-second.pdf', filename: 'z.pdf', mimeType: 'application/pdf', sizeBytes: 200, sha256Hash: 'z'.repeat(64) },
          { id: 'd1', storageKey: 'uploads/a-first.pdf', filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 100, sha256Hash: 'a'.repeat(64) },
        ],
      },
    });

    const builder = new CertificatePayloadBuilder(db as never);
    const result = await builder.build(RECORD_ID, CERTIFICATE_ID, ISSUED_AT);

    // Documents in payload should be sorted by storageKey (a before z)
    expect(result.payload.documents[0].filename).toBe('a.pdf');
    expect(result.payload.documents[1].filename).toBe('z.pdf');
  });
});
