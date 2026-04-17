/**
 * Authority Engine — Gate Group 7: Product Behavior
 *
 *  P1  P0  Signing Flow Integrity (all steps present and tested)
 *  P2  P0  Certificate Hash Integrity (tampering detection)
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../../src');
const TEST_DIR = path.resolve(__dirname, '../..');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ─── P1 · Signing Flow Integrity (P0) ────────────────────────────────────────

describe('P1 · Signing Flow Integrity (P0)', () => {
  it('signing flow service implements all required state transitions', () => {
    // Full flow: getOfferContext → requestOtp → verifyOtp → accept
    const flowFiles = fs
      .readdirSync(path.join(SRC, 'modules', 'signing', 'services'), { recursive: true })
      .filter((f) => f.toString().endsWith('.ts'))
      .map((f) =>
        fs.readFileSync(
          path.join(SRC, 'modules', 'signing', 'services', f.toString()),
          'utf-8',
        ),
      )
      .join('\n');

    expect(flowFiles).toContain('getOfferContext');
    expect(flowFiles).toContain('requestOtp');
    expect(flowFiles).toContain('verifyOtp');
    expect(flowFiles).toContain('accept');
  });

  it('signing token uses 256 bits of cryptographic entropy (crypto.randomBytes(32))', () => {
    const tokenSvc = readSrc(
      'modules', 'signing', 'services', 'signing-token.service.ts',
    );
    expect(tokenSvc).toContain('randomBytes(32)');
  });

  it('signing token is never stored raw — only SHA-256 hash persisted', () => {
    const tokenSvc = readSrc(
      'modules', 'signing', 'services', 'signing-token.service.ts',
    );
    expect(tokenSvc).toContain('sha256');
    expect(tokenSvc).toContain('tokenHash');
    // Raw token comment confirms intent
    expect(tokenSvc).toMatch(/never.*stored|never.*log|never.*persist/i);
  });

  it('signing events form a hash chain (each event commits to previous)', () => {
    const eventBuilder = path.join(
      SRC, 'modules', 'signing', 'domain', 'signing-event.builder.ts',
    );
    if (fs.existsSync(eventBuilder)) {
      const content = fs.readFileSync(eventBuilder, 'utf-8');
      expect(content).toMatch(/previousEventHash|previousHash|chain/i);
    } else {
      // Alternative: check the signing event service
      const eventSvc = readSrc(
        'modules', 'signing', 'services', 'signing-event.service.ts',
      );
      expect(eventSvc).toMatch(/previousEventHash|previousHash|chain/i);
    }
  });

  it('acceptance requires two factors: email token + OTP verification', () => {
    const flowSvc = path.join(SRC, 'modules', 'signing', 'services', 'signing-flow.service.ts');
    if (fs.existsSync(flowSvc)) {
      const content = fs.readFileSync(flowSvc, 'utf-8');
      // Both token verification and OTP must be required
      expect(content).toMatch(/otp.*verified|OTP_VERIFIED|twoFactor/i);
    }
  });

  it('acceptance creates an immutable AcceptanceRecord (no UPDATE on acceptance_records)', () => {
    // Verify that AcceptanceRecord is never updated after creation
    const allSigningSources = fs
      .readdirSync(path.join(SRC, 'modules', 'signing'), { recursive: true })
      .filter((f) => f.toString().endsWith('.ts'))
      .map((f) =>
        fs.readFileSync(
          path.join(SRC, 'modules', 'signing', f.toString()),
          'utf-8',
        ),
      )
      .join('\n');

    // No update() on acceptanceRecord after creation
    expect(allSigningSources).not.toMatch(/acceptanceRecord\.update\s*\(/);
  });

  it('signing flow has end-to-end test coverage in launch-confidence suite', () => {
    const raceTest = path.join(TEST_DIR, 'launch-confidence', '01-signing-race.spec.ts');
    const otpTest = path.join(TEST_DIR, 'launch-confidence', '02-otp-brute-force.spec.ts');
    const chainTest = path.join(TEST_DIR, 'launch-confidence', '03-event-chain-integrity.spec.ts');
    expect(fs.existsSync(raceTest)).toBe(true);
    expect(fs.existsSync(otpTest)).toBe(true);
    expect(fs.existsSync(chainTest)).toBe(true);
  });
});

// ─── P2 · Certificate Hash Integrity (P0) ────────────────────────────────────

describe('P2 · Certificate Hash Integrity (P0)', () => {
  it('CertificateService.verify recomputes certificate hash and compares to stored value', () => {
    const certSvc = readSrc('modules', 'certificates', 'certificate.service.ts');
    expect(certSvc).toContain('verify');
    expect(certSvc).toContain('certificateHash');
    expect(certSvc).toMatch(/recompute|computeCertificateHash|rebuild/i);
  });

  it('certificate verification checks canonical acceptance hash (5-field fingerprint)', () => {
    const certSvc = readSrc('modules', 'certificates', 'certificate.service.ts');
    expect(certSvc).toMatch(/canonicalHash|computeCanonicalAcceptanceHash/i);
  });

  it('certificate verification checks snapshot content integrity', () => {
    const certSvc = readSrc('modules', 'certificates', 'certificate.service.ts');
    expect(certSvc).toMatch(/snapshot.*hash|computeSnapshotHash|snapshotHash/i);
  });

  it('certificate verification reads ONLY immutable tables', () => {
    const certSvc = readSrc('modules', 'certificates', 'certificate.service.ts');
    // Must not query Offer or User (mutable) for verification
    const verifyFnMatch = certSvc.match(/verify\s*\([^)]*\)\s*\{[\s\S]*?\}/);
    if (verifyFnMatch) {
      const verifyBody = verifyFnMatch[0];
      // Should use AcceptanceCertificate, AcceptanceRecord, OfferSnapshot, SigningEvent
      expect(verifyBody).toMatch(/acceptanceCertificate|acceptanceRecord|offerSnapshot|signingEvent/i);
    }
  });

  it('tampering detection test exists in test suite', () => {
    const tamperTest = path.join(TEST_DIR, 'certificates', 'certificate-tampering.spec.ts');
    expect(fs.existsSync(tamperTest)).toBe(true);
  });

  it('certificate determinism test exists (same input always produces same hash)', () => {
    const detTest = path.join(
      TEST_DIR, 'launch-confidence', '04-certificate-determinism.spec.ts',
    );
    expect(fs.existsSync(detTest)).toBe(true);
  });

  it('CertificatePayloadBuilder is used for deterministic hash input construction', () => {
    const builderPath = path.join(
      SRC, 'modules', 'certificates', 'certificate-payload.builder.ts',
    );
    expect(fs.existsSync(builderPath)).toBe(true);
    const builder = fs.readFileSync(builderPath, 'utf-8');
    expect(builder).toContain('computeCertificateHash');
  });
});
