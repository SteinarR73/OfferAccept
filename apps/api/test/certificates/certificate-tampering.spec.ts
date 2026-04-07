import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { CertificateService } from '../../src/modules/certificates/certificate.service';
import { CertificatePayloadBuilder, computeCertificateHash } from '../../src/modules/certificates/certificate-payload.builder';
import { SigningEventService } from '../../src/modules/signing/services/signing-event.service';
import { DealEventService } from '../../src/modules/deal-events/deal-events.service';
import { computeSnapshotHash } from '../../src/modules/signing/domain/signing-event.builder';

// ─── Certificate tampering detection tests ────────────────────────────────────
//
// These tests verify that CertificateService.verify() correctly detects each
// category of tampering:
//
//   1. Modified certificate hash (stored hash changed after issuance)
//   2. Modified snapshot (offer content altered after sending)
//   3. Broken signing event chain (event inserted/deleted/modified)
//   4. Combined tampering (multiple simultaneous anomalies)
//   5. Undetectable tampering scenario documentation (what verify cannot catch)
//
// Test philosophy:
//   - Each test builds a VALID scenario first, then mutates exactly one thing
//   - The mutation corresponds to a real-world attack or data corruption event
//   - verify() must detect it AND report it in anomaliesDetected

const CERT_ID = 'cert-tamper-1';
const RECORD_ID = 'record-tamper-1';
const SESSION_ID = 'session-tamper-1';
const SNAPSHOT_ID = 'snap-tamper-1';
const ISSUED_AT = new Date('2024-06-01T12:00:00.000Z');
const OFFER_ID = 'offer-tamper-1';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const SNAPSHOT_DOCS = [
  { filename: 'contract.pdf', sha256Hash: 'c'.repeat(64), storageKey: 'uploads/contract.pdf' },
  { filename: 'appendix.pdf', sha256Hash: 'd'.repeat(64), storageKey: 'uploads/appendix.pdf' },
];

function makeSnapshotData() {
  return {
    id: SNAPSHOT_ID,
    offerId: OFFER_ID,
    title: 'Service Agreement 2024',
    message: 'Please review and accept.',
    senderName: 'Alice Corp',
    senderEmail: 'alice@corp.com',
    expiresAt: null,
    frozenAt: new Date('2024-05-01T10:00:00.000Z'),
    // Correct contentHash computed from the docs above
    contentHash: computeSnapshotHash({
      title: 'Service Agreement 2024',
      message: 'Please review and accept.',
      senderName: 'Alice Corp',
      senderEmail: 'alice@corp.com',
      expiresAt: null,
      documents: SNAPSHOT_DOCS,
    }),
    documents: SNAPSHOT_DOCS.map((d, i) => ({ id: `doc-${i}`, ...d })),
  };
}

function makePayload(issuedAt = ISSUED_AT) {
  const snapshot = makeSnapshotData();
  return {
    certificateId: CERT_ID,
    issuedAt: issuedAt.toISOString(),
    issuer: 'OfferAccept' as const,
    issuerVersion: '1.0' as const,
    offer: {
      title: snapshot.title,
      message: snapshot.message,
      expiresAt: null,
      sentAt: snapshot.frozenAt.toISOString(),
      snapshotContentHash: snapshot.contentHash,
    },
    sender: { name: snapshot.senderName, email: snapshot.senderEmail },
    recipient: { name: 'Bob Client', verifiedEmail: 'bob@client.com' },
    documents: [],
    acceptance: {
      statement: 'I, Bob Client, accept.',
      acceptedAt: '2024-06-01T11:59:00.000Z',
      verifiedEmail: 'bob@client.com',
      emailVerifiedAt: '2024-06-01T11:55:00.000Z',
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      locale: 'en-US',
      timezone: 'America/New_York',
    },
  };
}

function makeBuiltCert(issuedAt = ISSUED_AT) {
  const payload = makePayload(issuedAt);
  const { hash, canonical } = computeCertificateHash(payload);
  return { payload, certificateHash: hash, canonicalJson: canonical };
}

// ─── Test factory ──────────────────────────────────────────────────────────────

async function buildService(overrides: {
  storedHash?: string;
  snapshotOverride?: Partial<ReturnType<typeof makeSnapshotData>>;
  chainResult?: { valid: boolean; brokenAtSequence?: number };
  certNotFound?: boolean;
}) {
  const built = makeBuiltCert();
  const snapshot = { ...makeSnapshotData(), ...overrides.snapshotOverride };

  const db = {
    acceptanceCertificate: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(
        overrides.certNotFound
          ? null
          : {
              id: CERT_ID,
              acceptanceRecordId: RECORD_ID,
              certificateHash: overrides.storedHash ?? built.certificateHash,
              issuedAt: ISSUED_AT,
              canonicalHash: null,
            },
      ),
    },
    acceptanceRecord: {
      findUniqueOrThrow: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: RECORD_ID,
        sessionId: SESSION_ID,
        snapshotId: SNAPSHOT_ID,
        verifiedEmail: 'bob@client.com',
        acceptedAt: new Date('2024-06-01T11:59:00.000Z'),
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      }),
    },
    offerSnapshot: {
      findUniqueOrThrow: jest.fn<() => Promise<unknown>>().mockResolvedValue(snapshot),
    },
  };

  const builder = {
    build: jest.fn<() => Promise<typeof built>>().mockResolvedValue(built),
  };

  const eventService = {
    verifyChain: jest.fn<() => Promise<{ valid: boolean; brokenAtSequence?: number }>>()
      .mockResolvedValue(overrides.chainResult ?? { valid: true }),
  };

  const module = await Test.createTestingModule({
    providers: [
      CertificateService,
      { provide: 'PRISMA', useValue: db },
      { provide: CertificatePayloadBuilder, useValue: builder },
      { provide: SigningEventService, useValue: eventService },
      { provide: DealEventService, useValue: { emit: () => Promise.resolve(), getForDeal: () => Promise.resolve([]), getRecentForOrg: () => Promise.resolve([]) } },
    ],
  }).compile();

  return {
    service: module.get(CertificateService),
    db,
    builder,
    eventService,
  };
}

// ─── Baseline: intact certificate ─────────────────────────────────────────────

describe('CertificateService.verify() — intact certificate', () => {
  it('valid=true with no anomalies when all checks pass', async () => {
    const { service } = await buildService({});

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(true);
    expect(result.certificateHashMatch).toBe(true);
    expect(result.snapshotIntegrity).toBe(true);
    expect(result.eventChainValid).toBe(true);
    expect(result.anomaliesDetected).toHaveLength(0);
  });

  it('reconstructedHash equals storedHash for intact certificate', async () => {
    const { service } = await buildService({});

    const result = await service.verify(CERT_ID);

    expect(result.reconstructedHash).toBe(result.storedHash);
    expect(result.reconstructedHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('passes stored issuedAt (not new Date) to builder', async () => {
    const { service, builder } = await buildService({});

    await service.verify(CERT_ID);

    expect(builder.build).toHaveBeenCalledWith(RECORD_ID, CERT_ID, ISSUED_AT);
  });

  it('throws NotFoundException when certificate does not exist', async () => {
    const { service } = await buildService({ certNotFound: true });

    await expect(service.verify(CERT_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── Tampering scenario 1: Modified certificate hash ──────────────────────────
// Simulates: an attacker directly modifies AcceptanceCertificate.certificateHash
// in the database (e.g., to make a fraudulent acceptance appear valid or to
// invalidate a legitimate one).

describe('CertificateService.verify() — tampered certificate hash', () => {
  it('detects hash mismatch and reports anomaly', async () => {
    const tamperedHash = crypto.randomBytes(32).toString('hex'); // random — guaranteed different
    const { service } = await buildService({ storedHash: tamperedHash });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.certificateHashMatch).toBe(false);
    expect(result.snapshotIntegrity).toBe(true);  // snapshot is still intact
    expect(result.eventChainValid).toBe(true);    // chain is still intact
    expect(result.anomaliesDetected).toHaveLength(1);
    expect(result.anomaliesDetected[0]).toContain('Certificate hash mismatch');
  });

  it('exposes both reconstructedHash and storedHash so the discrepancy is visible', async () => {
    const tamperedHash = 'tampered' + '0'.repeat(57);
    const { service } = await buildService({ storedHash: tamperedHash });

    const result = await service.verify(CERT_ID);

    expect(result.storedHash).toBe(tamperedHash);
    expect(result.reconstructedHash).not.toBe(tamperedHash);
    expect(result.reconstructedHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ─── Tampering scenario 2: Modified offer snapshot ────────────────────────────
// Simulates: an attacker modifies OfferSnapshot content (e.g., changes the
// offer title or senderEmail) without regenerating the contentHash.
// The certificate hash itself is unaffected (it embeds the STORED contentHash
// value, not raw fields), but the snapshot integrity check catches the discrepancy.

describe('CertificateService.verify() — tampered snapshot content', () => {
  it('detects snapshot integrity failure when title was changed', async () => {
    const { service } = await buildService({
      // Snapshot title changed after sending — contentHash is now stale
      snapshotOverride: { title: 'MODIFIED TITLE — fraud attempt' },
    });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.snapshotIntegrity).toBe(false);
    expect(result.certificateHashMatch).toBe(true);  // stored cert hash is still valid
    expect(result.eventChainValid).toBe(true);       // chain is still intact
    expect(result.anomaliesDetected).toHaveLength(1);
    expect(result.anomaliesDetected[0]).toContain('Snapshot integrity failure');
  });

  it('detects snapshot integrity failure when senderEmail was changed', async () => {
    const { service } = await buildService({
      snapshotOverride: { senderEmail: 'impostor@evil.com' },
    });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.snapshotIntegrity).toBe(false);
    expect(result.anomaliesDetected[0]).toContain('Snapshot integrity failure');
  });

  it('detects snapshot integrity failure when a document hash was changed', async () => {
    const { service } = await buildService({
      snapshotOverride: {
        documents: [
          { id: 'doc-0', filename: 'contract.pdf', sha256Hash: 'f'.repeat(64), storageKey: 'uploads/contract.pdf' },
          { id: 'doc-1', filename: 'appendix.pdf', sha256Hash: 'd'.repeat(64), storageKey: 'uploads/appendix.pdf' },
        ],
      },
    });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.snapshotIntegrity).toBe(false);
    expect(result.anomaliesDetected[0]).toContain('Snapshot integrity failure');
  });

  it('does NOT flag snapshot integrity failure when content hash matches', async () => {
    // Snapshot with consistent contentHash — should pass
    const snapshot = makeSnapshotData();
    const { service } = await buildService({
      // No override — snapshot is consistent
    });

    const result = await service.verify(CERT_ID);

    expect(result.snapshotIntegrity).toBe(true);
    expect(result.anomaliesDetected.some(a => a.includes('Snapshot'))).toBe(false);
  });
});

// ─── Tampering scenario 3: Broken signing event chain ─────────────────────────
// Simulates: an event was deleted from SigningEvent, an event was inserted out of
// order, or an event's payload was modified after the fact.
// The chain verifier recomputes each event's hash and checks linkage.

describe('CertificateService.verify() — broken signing event chain', () => {
  it('detects a broken chain at sequence 1 and reports the sequence number', async () => {
    const { service } = await buildService({
      chainResult: { valid: false, brokenAtSequence: 1 },
    });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.eventChainValid).toBe(false);
    expect(result.brokenAtSequence).toBe(1);
    expect(result.certificateHashMatch).toBe(true);  // hash is still intact
    expect(result.snapshotIntegrity).toBe(true);     // snapshot is still intact
    expect(result.anomaliesDetected).toHaveLength(1);
    expect(result.anomaliesDetected[0]).toContain('Signing event chain broken at sequence 1');
  });

  it('detects a broken chain mid-sequence (e.g., event 4 was inserted)', async () => {
    const { service } = await buildService({
      chainResult: { valid: false, brokenAtSequence: 4 },
    });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(4);
    expect(result.anomaliesDetected[0]).toContain('sequence 4');
  });

  it('reports brokenAtSequence as undefined when chain is valid', async () => {
    const { service } = await buildService({ chainResult: { valid: true } });

    const result = await service.verify(CERT_ID);

    expect(result.brokenAtSequence).toBeUndefined();
  });
});

// ─── Tampering scenario 4: Multiple simultaneous anomalies ────────────────────
// Simulates a sophisticated attack or a catastrophic data corruption event
// where multiple checks fail simultaneously.

describe('CertificateService.verify() — multiple simultaneous anomalies', () => {
  it('detects all three anomalies when hash, snapshot, and chain are all compromised', async () => {
    const { service } = await buildService({
      storedHash: 'deadbeef' + '0'.repeat(56),
      snapshotOverride: { title: 'TAMPERED TITLE' },
      chainResult: { valid: false, brokenAtSequence: 2 },
    });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.certificateHashMatch).toBe(false);
    expect(result.snapshotIntegrity).toBe(false);
    expect(result.eventChainValid).toBe(false);
    expect(result.anomaliesDetected).toHaveLength(3);
    expect(result.anomaliesDetected.some(a => a.includes('Certificate hash mismatch'))).toBe(true);
    expect(result.anomaliesDetected.some(a => a.includes('Snapshot integrity failure'))).toBe(true);
    expect(result.anomaliesDetected.some(a => a.includes('Signing event chain broken'))).toBe(true);
  });

  it('reports exactly two anomalies when hash and chain are bad but snapshot is intact', async () => {
    const { service } = await buildService({
      storedHash: 'bad' + '0'.repeat(61),
      chainResult: { valid: false, brokenAtSequence: 3 },
    });

    const result = await service.verify(CERT_ID);

    expect(result.valid).toBe(false);
    expect(result.anomaliesDetected).toHaveLength(2);
    expect(result.snapshotIntegrity).toBe(true);
  });
});

// ─── Verification completeness: all checks run independently ──────────────────
// Verifies that a failure in one check does NOT short-circuit the others.
// All three checks must run and be reported even if the first one fails.

describe('CertificateService.verify() — all checks run independently', () => {
  it('runs snapshot and chain checks even when certificate hash fails', async () => {
    const { service, eventService } = await buildService({
      storedHash: 'bad' + '0'.repeat(61),
    });

    await service.verify(CERT_ID);

    // eventService.verifyChain must be called even though hash check failed
    expect(eventService.verifyChain).toHaveBeenCalled();
  });

  it('runs chain check even when snapshot integrity fails', async () => {
    const { service, eventService } = await buildService({
      snapshotOverride: { title: 'TAMPERED' },
    });

    await service.verify(CERT_ID);

    expect(eventService.verifyChain).toHaveBeenCalled();
  });

  it('runs certificate hash check even when chain is broken', async () => {
    const { service, builder } = await buildService({
      chainResult: { valid: false, brokenAtSequence: 1 },
    });

    await service.verify(CERT_ID);

    expect(builder.build).toHaveBeenCalled();
  });
});

// ─── Public endpoint safety: no sensitive data in anomaly messages ─────────────
// Anomaly descriptions must be safe to return publicly (no IPs, emails, hashes
// of private data). Only structural descriptions are included.

describe('CertificateService.verify() — anomaly message safety', () => {
  it('anomaly messages do not contain raw email addresses', async () => {
    const { service } = await buildService({
      storedHash: 'tampered' + '0'.repeat(57),
      snapshotOverride: { title: 'TAMPERED' },
      chainResult: { valid: false, brokenAtSequence: 1 },
    });

    const result = await service.verify(CERT_ID);

    for (const anomaly of result.anomaliesDetected) {
      expect(anomaly).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    }
  });

  it('anomaly messages do not contain IP addresses', async () => {
    const { service } = await buildService({
      chainResult: { valid: false, brokenAtSequence: 2 },
    });

    const result = await service.verify(CERT_ID);

    for (const anomaly of result.anomaliesDetected) {
      expect(anomaly).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    }
  });
});

// ─── Integration: computeSnapshotHash consistency with send-offer-service ──────
// The snapshot content hash computed at send time (in SendOfferService) and the
// hash recomputed at verification time (in CertificateService.verify via
// computeSnapshotHash) must use the same algorithm.

describe('Snapshot hash consistency between send and verify', () => {
  it('computeSnapshotHash produces identical result regardless of document input order', () => {
    const base = {
      title: 'Test',
      message: null,
      senderName: 'Alice',
      senderEmail: 'alice@co.com',
      expiresAt: null,
      documents: [
        { filename: 'b.pdf', sha256Hash: 'b'.repeat(64), storageKey: 'uploads/b.pdf' },
        { filename: 'a.pdf', sha256Hash: 'a'.repeat(64), storageKey: 'uploads/a.pdf' },
      ],
    };

    // Reversed order — hash must be the same (sorted by storageKey internally)
    const reversed = {
      ...base,
      documents: [...base.documents].reverse(),
    };

    expect(computeSnapshotHash(base)).toBe(computeSnapshotHash(reversed));
  });

  it('computeSnapshotHash changes when a document sha256Hash changes', () => {
    const base = {
      title: 'Test',
      message: null,
      senderName: 'Alice',
      senderEmail: 'alice@co.com',
      expiresAt: null,
      documents: [{ filename: 'doc.pdf', sha256Hash: 'a'.repeat(64), storageKey: 'uploads/doc.pdf' }],
    };

    const tampered = {
      ...base,
      documents: [{ filename: 'doc.pdf', sha256Hash: 'b'.repeat(64), storageKey: 'uploads/doc.pdf' }],
    };

    expect(computeSnapshotHash(base)).not.toBe(computeSnapshotHash(tampered));
  });

  it('computeSnapshotHash changes when storageKey changes (binds to specific file bytes)', () => {
    const base = {
      title: 'Test', message: null, senderName: 'A', senderEmail: 'a@b.com', expiresAt: null,
      documents: [{ filename: 'doc.pdf', sha256Hash: 'a'.repeat(64), storageKey: 'uploads/original.pdf' }],
    };
    const swapped = {
      ...base,
      documents: [{ filename: 'doc.pdf', sha256Hash: 'a'.repeat(64), storageKey: 'uploads/different.pdf' }],
    };
    expect(computeSnapshotHash(base)).not.toBe(computeSnapshotHash(swapped));
  });
});
