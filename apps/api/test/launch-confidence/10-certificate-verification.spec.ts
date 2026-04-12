/**
 * TEST 10 — Certificate Verification
 *
 * Invariant: CertificateService.verify() must independently recompute all
 * cryptographic hashes from immutable evidence tables and return valid=true only
 * when ALL checks pass:
 *   A. Certificate hash recomputed from AcceptanceRecord + OfferSnapshot matches
 *      AcceptanceCertificate.certificateHash.
 *   B. Canonical acceptance hash (5-field fingerprint) matches stored canonicalHash.
 *   C. OfferSnapshot.contentHash matches hash recomputed from raw document rows.
 *   D. Signing event chain is intact (no inserted, deleted, or modified events).
 *
 * Strategy:
 *   - Build the ground truth using the real computeCertificateHash and
 *     computeCanonicalAcceptanceHash functions (same functions used at issuance).
 *   - Mock the DB reads so CertificateService.verify() sees the same evidence.
 *   - Mock the builder to return the correct recomputed hash (simulating a DB read
 *     that returns identical evidence).
 *   - Mock the event chain to return valid=true.
 *   - Mutate individual pieces of stored state and verify that the corresponding
 *     check fails while the others still pass.
 */

import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import {
  computeCertificateHash,
  computeCanonicalAcceptanceHash,
  CertificatePayload,
} from '../../src/modules/certificates/certificate-payload.builder';
import { computeSnapshotHash } from '../../src/modules/signing/domain/signing-event.builder';

// ─── Ground-truth fixture ──────────────────────────────────────────────────────

const CERT_ID = 'cert-verify-test';
const ACCEPTANCE_RECORD_ID = 'record-1';
const SESSION_ID = 'session-1';
const SNAPSHOT_ID = 'snapshot-1';
const OFFER_ID = 'offer-1';
const ISSUED_AT = new Date('2026-03-01T12:00:00.000Z');

const DOC = {
  filename: 'contract.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 204800,
  sha256Hash: 'b'.repeat(64),
  storageKey: 'org-1/doc-1/contract.pdf',
};

// computeSnapshotHash only uses filename, sha256Hash, storageKey from each document.
// Extra fields (mimeType, sizeBytes) must NOT be included here or the stored hash
// will differ from the recomputed hash in verify() which strips to these 3 fields.
const SNAPSHOT_HASH_INPUT = {
  title: 'Software Development Agreement',
  message: 'Please review and accept.',
  senderName: 'Acme Corp',
  senderEmail: 'sender@acme.com',
  expiresAt: '2026-04-01T00:00:00.000Z',
  documents: [{ filename: DOC.filename, sha256Hash: DOC.sha256Hash, storageKey: DOC.storageKey }],
};

const COMPUTED_SNAPSHOT_HASH = computeSnapshotHash(SNAPSHOT_HASH_INPUT);

const CERT_PAYLOAD: CertificatePayload = {
  certificateId: CERT_ID,
  issuedAt: ISSUED_AT.toISOString(),
  issuer: 'OfferAccept',
  issuerVersion: '1.0',
  offer: {
    title: 'Software Development Agreement',
    message: 'Please review and accept.',
    expiresAt: '2026-04-01T00:00:00.000Z',
    sentAt: '2026-02-28T09:00:00.000Z',
    snapshotContentHash: COMPUTED_SNAPSHOT_HASH,
  },
  sender: { name: 'Acme Corp', email: 'sender@acme.com' },
  recipient: { name: 'Jane Smith', verifiedEmail: 'jane@example.com' },
  documents: [{ filename: DOC.filename, mimeType: DOC.mimeType, sizeBytes: DOC.sizeBytes, sha256Hash: DOC.sha256Hash }],
  acceptance: {
    statement: 'I, Jane Smith, accept this agreement.',
    acceptedAt: '2026-03-01T12:00:00.000Z',
    verifiedEmail: 'jane@example.com',
    emailVerifiedAt: '2026-03-01T11:58:00.000Z',
    ipAddress: '203.0.113.42',
    userAgent: 'Mozilla/5.0',
    locale: 'en-GB',
    timezone: 'Europe/London',
  },
};

const { hash: CERT_HASH } = computeCertificateHash(CERT_PAYLOAD);

const { hash: CANONICAL_HASH } = computeCanonicalAcceptanceHash({
  acceptedAt: '2026-03-01T12:00:00.000Z',
  dealId: OFFER_ID,
  ipAddress: '203.0.113.42',
  recipientEmail: 'jane@example.com',
  userAgent: 'Mozilla/5.0',
});

// ─── Mock factories ────────────────────────────────────────────────────────────

function makeValidCert(overrides: { canonicalHash?: string | null } = {}) {
  return {
    id: CERT_ID,
    offerId: OFFER_ID,
    acceptanceRecordId: ACCEPTANCE_RECORD_ID,
    certificateHash: CERT_HASH,
    canonicalHash: CANONICAL_HASH as string | null,
    issuedAt: ISSUED_AT,
    snapshotId: SNAPSHOT_ID,
    ...overrides,
  };
}

function makeValidRecord() {
  return {
    id: ACCEPTANCE_RECORD_ID,
    sessionId: SESSION_ID,
    snapshotId: SNAPSHOT_ID,
    verifiedEmail: 'jane@example.com',
    acceptedAt: new Date('2026-03-01T12:00:00.000Z'),
    ipAddress: '203.0.113.42',
    userAgent: 'Mozilla/5.0',
    acceptanceStatementVersion: null,  // not relevant to integrity checks in this suite
  };
}

function makeValidSnapshot() {
  return {
    id: SNAPSHOT_ID,
    offerId: OFFER_ID,
    title: SNAPSHOT_HASH_INPUT.title,
    message: SNAPSHOT_HASH_INPUT.message,
    senderName: SNAPSHOT_HASH_INPUT.senderName,
    senderEmail: SNAPSHOT_HASH_INPUT.senderEmail,
    expiresAt: new Date(SNAPSHOT_HASH_INPUT.expiresAt!),
    contentHash: COMPUTED_SNAPSHOT_HASH, // correct stored hash
    documents: [DOC],
  };
}

function makeDb(
  cert: ReturnType<typeof makeValidCert> | null,
  record: ReturnType<typeof makeValidRecord>,
  snapshot: ReturnType<typeof makeValidSnapshot>,
) {
  return {
    acceptanceCertificate: {
      findUnique: jest.fn<any>().mockResolvedValue(cert),
    },
    acceptanceRecord: {
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue(record),
    },
    offerSnapshot: {
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue(snapshot),
    },
    // Legacy event — no acceptanceStatementHash field → statement check is N/A
    signingEvent: {
      findFirst: jest.fn<any>().mockResolvedValue({ payload: {} }),
    },
    // Returns termsVersionAtCreation for the metadata section; null is safe here
    // since this test suite focuses on integrity checks, not metadata content.
    offer: {
      findUnique: jest.fn<any>().mockResolvedValue({ termsVersionAtCreation: null }),
    },
  };
}

function makeBuilder(certificateHash: string) {
  // Simulate the builder re-reading evidence from DB and returning the recomputed hash
  return {
    build: jest.fn<any>().mockResolvedValue({
      payload: CERT_PAYLOAD,
      certificateHash,
      canonicalJson: JSON.stringify(CERT_PAYLOAD),
    }),
  };
}

function makeEventService(valid: boolean, brokenAtSequence?: number) {
  return {
    verifyChain: jest.fn<any>().mockResolvedValue({ valid, brokenAtSequence }),
  };
}

function makeDealEventService() {
  return { emit: jest.fn<any>().mockResolvedValue(undefined) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TEST 10 — Certificate Verification', () => {
  it('returns valid=true for a correctly stored certificate', async () => {
    const svc = new CertificateService(
      makeDb(makeValidCert(), makeValidRecord(), makeValidSnapshot()) as never,
      makeBuilder(CERT_HASH) as never,
      makeEventService(true) as never,
      makeDealEventService() as never,
    );

    const result = await svc.verify(CERT_ID);

    expect(result.valid).toBe(true);
    expect(result.certificateHashMatch).toBe(true);
    expect(result.canonicalHashMatch).toBe(true);
    expect(result.snapshotIntegrity).toBe(true);
    expect(result.eventChainValid).toBe(true);
    expect(result.anomaliesDetected).toHaveLength(0);
  });

  it('returns valid=false when the stored certificate hash has been tampered', async () => {
    const tamperedCert = {
      ...makeValidCert(),
      certificateHash: 'deadbeef'.repeat(8), // wrong stored hash
    };

    const svc = new CertificateService(
      makeDb(tamperedCert, makeValidRecord(), makeValidSnapshot()) as never,
      makeBuilder(CERT_HASH) as never, // builder still recomputes correct hash
      makeEventService(true) as never,
      makeDealEventService() as never,
    );

    const result = await svc.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.certificateHashMatch).toBe(false);
    expect(result.reconstructedHash).toBe(CERT_HASH);
    expect(result.storedHash).toBe('deadbeef'.repeat(8));
    expect(result.anomaliesDetected.length).toBeGreaterThan(0);
  });

  it('returns valid=false when the canonical acceptance hash has been tampered', async () => {
    const tamperedCert = {
      ...makeValidCert(),
      canonicalHash: 'cafebabe'.repeat(8), // wrong canonical hash
    };

    const svc = new CertificateService(
      makeDb(tamperedCert, makeValidRecord(), makeValidSnapshot()) as never,
      makeBuilder(CERT_HASH) as never,
      makeEventService(true) as never,
      makeDealEventService() as never,
    );

    const result = await svc.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.canonicalHashMatch).toBe(false);
    expect(result.certificateHashMatch).toBe(true); // cert hash check still passes
    expect(result.anomaliesDetected.length).toBeGreaterThan(0);
  });

  it('returns valid=false when snapshot content has been tampered (contentHash mismatch)', async () => {
    const tamperedSnapshot = {
      ...makeValidSnapshot(),
      contentHash: 'ffffffff'.repeat(8), // stored hash no longer matches documents
    };

    const svc = new CertificateService(
      makeDb(makeValidCert(), makeValidRecord(), tamperedSnapshot) as never,
      makeBuilder(CERT_HASH) as never,
      makeEventService(true) as never,
      makeDealEventService() as never,
    );

    const result = await svc.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.snapshotIntegrity).toBe(false);
    expect(result.anomaliesDetected.length).toBeGreaterThan(0);
  });

  it('returns valid=false when the signing event chain is broken', async () => {
    const svc = new CertificateService(
      makeDb(makeValidCert(), makeValidRecord(), makeValidSnapshot()) as never,
      makeBuilder(CERT_HASH) as never,
      makeEventService(false, 3) as never, // chain broken at sequence 3
      makeDealEventService() as never,
    );

    const result = await svc.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.eventChainValid).toBe(false);
    expect(result.brokenAtSequence).toBe(3);
    expect(result.anomaliesDetected.length).toBeGreaterThan(0);
  });

  it('skips canonical hash check for legacy certificates (canonicalHash is null)', async () => {
    const legacyCert = makeValidCert({ canonicalHash: null }); // field did not exist at issuance time

    const svc = new CertificateService(
      makeDb(legacyCert, makeValidRecord(), makeValidSnapshot()) as never,
      makeBuilder(CERT_HASH) as never,
      makeEventService(true) as never,
      makeDealEventService() as never,
    );

    const result = await svc.verify(CERT_ID);

    // canonicalHashMatch is undefined (N/A — not counted as a failure)
    expect(result.canonicalHashMatch).toBeUndefined();

    // Phase 1 invariant: LEGACY_CERTIFICATE advisory anomaly → valid=false
    // but integrityChecksPass=true (no tampering detected, incomplete guarantees only)
    expect(result.valid).toBe(false);
    expect(result.integrityChecksPass).toBe(true);
    expect(result.advisoryAnomalies).toHaveLength(1);
    expect(result.advisoryAnomalies[0]).toContain('LEGACY_CERTIFICATE');
    expect(result.integrityAnomalies).toHaveLength(0);
  });

  it('throws NotFoundException when certificate does not exist', async () => {
    const db = makeDb(null, makeValidRecord(), makeValidSnapshot());

    const svc = new CertificateService(
      db as never,
      makeBuilder(CERT_HASH) as never,
      makeEventService(true) as never,
      makeDealEventService() as never,
    );

    await expect(svc.verify('nonexistent-cert-id')).rejects.toThrow(NotFoundException);
  });

  it('multiple independent failures are all reported in anomaliesDetected', async () => {
    const tamperedCert = {
      ...makeValidCert(),
      certificateHash: 'bad1'.repeat(16),
      canonicalHash: 'bad2'.repeat(16),
    };
    const tamperedSnapshot = {
      ...makeValidSnapshot(),
      contentHash: 'bad3'.repeat(16),
    };

    const svc = new CertificateService(
      makeDb(tamperedCert, makeValidRecord(), tamperedSnapshot) as never,
      makeBuilder(CERT_HASH) as never,
      makeEventService(false, 2) as never,
      makeDealEventService() as never,
    );

    const result = await svc.verify(CERT_ID);

    expect(result.valid).toBe(false);

    // All 4 checks failed — 4 anomalies reported
    expect(result.anomaliesDetected).toHaveLength(4);
    expect(result.certificateHashMatch).toBe(false);
    expect(result.canonicalHashMatch).toBe(false);
    expect(result.snapshotIntegrity).toBe(false);
    expect(result.eventChainValid).toBe(false);
  });
});
