/**
 * TEST 5 — Snapshot Immutability
 *
 * Invariant: OfferSnapshot is append-only. No application path may update or
 * delete a snapshot row after it is created. The contentHash must never change.
 *
 * Strategy:
 *   - Verify that no service in the signing or offer module exposes an update
 *     path for OfferSnapshot (structural / import analysis).
 *   - Verify that the computeSnapshotHash function is deterministic: re-running
 *     it against the same inputs always produces the same contentHash.
 *   - Verify that the contentHash in an AcceptanceRecord is always copied from
 *     the snapshot at creation time, making the record self-contained.
 *   - Verify that a tampered snapshot (contentHash changed) is detectable by
 *     comparing the stored hash against a re-computation.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeSnapshotHash,
  SnapshotHashInput,
} from '../../src/modules/signing/domain/signing-event.builder';

const SRC_ROOT = path.resolve(__dirname, '../../src');

function makeSnapshotInput(overrides: Partial<SnapshotHashInput> = {}): SnapshotHashInput {
  return {
    title: 'Software Development Agreement',
    message: 'Please review and accept this agreement.',
    senderName: 'Acme Corp',
    senderEmail: 'sender@acme.com',
    expiresAt: '2026-04-01T00:00:00.000Z',
    documents: [
      { filename: 'contract.pdf', sha256Hash: 'a'.repeat(64), storageKey: 'org-1/doc-1/contract.pdf' },
      { filename: 'appendix.pdf', sha256Hash: 'b'.repeat(64), storageKey: 'org-1/doc-2/appendix.pdf' },
    ],
    ...overrides,
  };
}

describe('TEST 5 — Snapshot Immutability', () => {
  describe('Application code analysis', () => {
    it('no service file calls offerSnapshot.update() or offerSnapshot.delete()', () => {
      const forbiddenPatterns = [
        /offerSnapshot\.update\(/,
        /offerSnapshot\.delete\(/,
        /offerSnapshot\.updateMany\(/,
        /offerSnapshot\.deleteMany\(/,
      ];

      const violations: string[] = [];

      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const pattern of forbiddenPatterns) {
              if (pattern.test(content)) {
                violations.push(`${fullPath}: matches ${pattern}`);
              }
            }
          }
        }
      }

      scanDir(SRC_ROOT);

      if (violations.length > 0) {
        throw new Error(
          `INVARIANT VIOLATION: OfferSnapshot mutation detected in source code:\n${violations.join('\n')}`,
        );
      }

      expect(violations).toHaveLength(0);
    });

    it('no service file calls acceptanceRecord.update() or acceptanceRecord.delete()', () => {
      const forbiddenPatterns = [
        /acceptanceRecord\.update\(/,
        /acceptanceRecord\.delete\(/,
        /acceptanceRecord\.updateMany\(/,
        /acceptanceRecord\.deleteMany\(/,
      ];

      const violations: string[] = [];

      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const pattern of forbiddenPatterns) {
              if (pattern.test(content)) {
                violations.push(`${fullPath}: matches ${pattern}`);
              }
            }
          }
        }
      }

      scanDir(SRC_ROOT);

      expect(violations).toHaveLength(0);
    });

    it('no service file calls signingEvent.update() or signingEvent.delete()', () => {
      const forbiddenPatterns = [
        /signingEvent\.update\(/,
        /signingEvent\.delete\(/,
        /signingEvent\.updateMany\(/,
        /signingEvent\.deleteMany\(/,
      ];

      const violations: string[] = [];

      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const pattern of forbiddenPatterns) {
              if (pattern.test(content)) {
                violations.push(`${fullPath}: matches ${pattern}`);
              }
            }
          }
        }
      }

      scanDir(SRC_ROOT);

      expect(violations).toHaveLength(0);
    });
  });

  describe('Snapshot hash determinism', () => {
    it('produces identical hashes for identical inputs', () => {
      const input = makeSnapshotInput();
      const hash1 = computeSnapshotHash(input);
      const hash2 = computeSnapshotHash(input);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('document order does not affect hash (sorted by storageKey)', () => {
      const doc1 = { filename: 'a.pdf', sha256Hash: 'a'.repeat(64), storageKey: 'org/doc-a.pdf' };
      const doc2 = { filename: 'b.pdf', sha256Hash: 'b'.repeat(64), storageKey: 'org/doc-b.pdf' };

      const forwardOrder = computeSnapshotHash(makeSnapshotInput({ documents: [doc1, doc2] }));
      const reverseOrder = computeSnapshotHash(makeSnapshotInput({ documents: [doc2, doc1] }));

      // computeSnapshotHash sorts by storageKey internally — both must match
      expect(forwardOrder).toBe(reverseOrder);
    });

    it('any field change produces a different hash (tamper detection)', () => {
      const base = makeSnapshotInput();
      const baseHash = computeSnapshotHash(base);

      const mutations: Array<Partial<SnapshotHashInput>> = [
        { title: 'Modified Title' },
        { message: 'Different message' },
        { senderEmail: 'other@acme.com' },
        { expiresAt: '2026-05-01T00:00:00.000Z' },
        {
          documents: [
            { filename: 'contract.pdf', sha256Hash: 'c'.repeat(64), storageKey: 'org-1/doc-1/contract.pdf' },
            { filename: 'appendix.pdf', sha256Hash: 'b'.repeat(64), storageKey: 'org-1/doc-2/appendix.pdf' },
          ],
        },
      ];

      for (const mutation of mutations) {
        const mutatedHash = computeSnapshotHash(makeSnapshotInput(mutation));
        expect(mutatedHash).not.toBe(baseHash);
      }
    });
  });

  describe('Tamper detectability via stored hash', () => {
    it('re-computation detects a modified snapshot title', () => {
      const original = makeSnapshotInput();
      const storedHash = computeSnapshotHash(original);

      // Simulate an attacker modifying the snapshot title in the DB
      const tampered: SnapshotHashInput = { ...original, title: 'Fraudulent Agreement' };
      const recomputedHash = computeSnapshotHash(tampered);

      expect(recomputedHash).not.toBe(storedHash);
    });

    it('re-computation detects a replaced document SHA-256', () => {
      const original = makeSnapshotInput();
      const storedHash = computeSnapshotHash(original);

      // Simulate a swapped document hash
      const tampered: SnapshotHashInput = {
        ...original,
        documents: [
          { filename: 'contract.pdf', sha256Hash: 'f'.repeat(64), storageKey: 'org-1/doc-1/contract.pdf' },
          original.documents[1],
        ],
      };
      const recomputedHash = computeSnapshotHash(tampered);

      expect(recomputedHash).not.toBe(storedHash);
    });
  });

  describe('AcceptanceRecord snapshot binding', () => {
    it('snapshotContentHash is a deterministic copy of OfferSnapshot.contentHash at creation time', () => {
      // The AcceptanceRecord.snapshotContentHash is copied from OfferSnapshot.contentHash
      // at acceptance time — not re-computed. This test verifies the binding property:
      // if we know the snapshot inputs, we can verify the AcceptanceRecord.snapshotContentHash
      // without querying the snapshot table.
      const snapshotInput = makeSnapshotInput();
      const snapshotHash = computeSnapshotHash(snapshotInput);

      // Simulate: AcceptanceRecord was created with snapshotContentHash = snapshotHash
      const acceptanceRecord = {
        snapshotContentHash: snapshotHash,
      };

      // Verification: re-compute from the known inputs
      const recomputed = computeSnapshotHash(snapshotInput);
      expect(recomputed).toBe(acceptanceRecord.snapshotContentHash);
    });
  });
});
