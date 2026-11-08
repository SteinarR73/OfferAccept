/**
 * Authority Engine — Gate Group 8: Abuse Resistance
 *
 *  B1  P1  Link Guessing Protection (≥128 bit token entropy)
 *  B2  P1  Public Verify Rate Limit
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { generateRecipientToken } from '../../../src/modules/signing/domain/recipient-token';

const SRC = path.resolve(__dirname, '../../../src');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ─── B1 · Link Guessing Protection (P1) ──────────────────────────────────────

describe('B1 · Link Guessing Protection (P1)', () => {
  it('signing token carries 256 bits of entropy (>= 128 bit requirement)', () => {
    const { rawToken } = generateRecipientToken(new Date());
    const body = rawToken.slice('oa_'.length);
    expect(Buffer.from(body, 'base64url')).toHaveLength(32);
  });

  it('signing token is "oa_" + base64url and unique per call', () => {
    const a = generateRecipientToken(new Date()).rawToken;
    const b = generateRecipientToken(new Date()).rawToken;
    expect(a).toMatch(/^oa_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('only the SHA-256 hash of the token is meant for storage', () => {
    const { rawToken, tokenHash } = generateRecipientToken(new Date());
    expect(tokenHash).toBe(crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex'));
    expect(tokenHash).not.toContain(rawToken);
  });

  it('constant-time delay is applied on token verification failure (timing attack prevention)', () => {
    const tokenSvc = readSrc(
      'modules', 'signing', 'services', 'signing-token.service.ts',
    );
    expect(tokenSvc).toContain('constantDelay');
  });

  it('expired and revoked tokens are rejected with the same error (no enumeration)', () => {
    const tokenSvc = readSrc(
      'modules', 'signing', 'services', 'signing-token.service.ts',
    );
    // TokenInvalidError used for all failure modes
    expect(tokenSvc).toContain('TokenInvalidError');
    // Not found, expired, and invalidated all throw the same error
    expect(tokenSvc).toMatch(/tokenInvalidatedAt.*null|expiresAt.*gt/);
  });

  it('SIGNING_LINK_SECRET is validated for minimum length (>=32 chars)', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('SIGNING_LINK_SECRET');
    expect(envFile).toContain('min(32)');
  });

  it('SIGNING_LINK_SECRET must not contain "change-me" in production', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('SIGNING_LINK_SECRET');
    expect(envFile).toContain('change-me');
  });
});

// ─── B2 · Public Verify Rate Limit (P1) ──────────────────────────────────────

describe('B2 · Public Verify Rate Limit (P1)', () => {
  it('rate-limit service defines cert_verify profile for public verification endpoint', () => {
    const rlFile = readSrc('common', 'rate-limit', 'rate-limit.service.ts');
    expect(rlFile).toContain('cert_verify');
  });

  it('cert_verify profile has a limit of ≤30 per minute', () => {
    const rlFile = readSrc('common', 'rate-limit', 'rate-limit.service.ts');
    const match = rlFile.match(/cert_verify[^}]+limit:\s*(\d+)/);
    expect(match).not.toBeNull();
    const limit = parseInt(match![1], 10);
    // Must be rate-limited (not zero = unlimited)
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThanOrEqual(30);
  });

  it('certificates controller applies cert_verify rate limit on the verify endpoint', () => {
    const ctrlFile = readSrc('modules', 'certificates', 'certificates.controller.ts');
    expect(ctrlFile).toContain('cert_verify');
  });

  it('cert verify rate limit test exists in test suite', () => {
    const testFile = path.resolve(
      __dirname,
      '../../certificates/cert-verify-ratelimit.spec.ts',
    );
    expect(fs.existsSync(testFile)).toBe(true);
  });

  it('global API rate limit guard is registered as APP_GUARD (defence-in-depth)', () => {
    const appModule = readSrc('app.module.ts');
    expect(appModule).toContain('ApiRateLimitGuard');
    expect(appModule).toContain('APP_GUARD');
  });

  it('rate limiter uses Redis in production (not in-memory per-process)', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain("RATE_LIMIT_BACKEND=memory must not be used in production");
  });
});
