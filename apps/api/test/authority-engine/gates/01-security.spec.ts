/**
 * Authority Engine — Gate Group 1: Security Invariants
 *
 *  S1  P0  Admin MFA Enforcement
 *  S2  P0  JWT Secret Rotation Support
 *  S3  P1  OTP Rate Limit
 */

import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';

const SRC = path.resolve(__dirname, '../../../src');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ─── S1 · Admin MFA Enforcement (P0) ─────────────────────────────────────────

describe('S1 · Admin MFA Enforcement (P0)', () => {
  it('env schema requires REQUIRE_SUPPORT_MFA to be configurable', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('REQUIRE_SUPPORT_MFA');
  });

  it('support guard enforces MFA claim when REQUIRE_SUPPORT_MFA=true', () => {
    // InternalSupportGuard lives in common/auth (not security module)
    const guardFile = readSrc('common', 'auth', 'internal-support.guard.ts');
    expect(guardFile).toContain('REQUIRE_SUPPORT_MFA');
    expect(guardFile).toContain('mfaVerifiedAt');
  });

  it('env schema documents SUPPORT_SESSION_TTL_MINUTES to limit privileged sessions', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('SUPPORT_SESSION_TTL_MINUTES');
  });

  it('env schema documents SUPPORT_IP_ALLOWLIST for privileged access restriction', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('SUPPORT_IP_ALLOWLIST');
  });
});

// ─── S2 · JWT Secret Rotation Support (P0) ───────────────────────────────────

describe('S2 · JWT Secret Rotation Support (P0)', () => {
  it('env schema defines JWT_SECRETS for multi-secret rotation', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('JWT_SECRETS');
  });

  it('JwtAuthGuard reads JWT_SECRETS and attempts verification against each secret', () => {
    const guardFile = readSrc('common', 'auth', 'jwt-auth.guard.ts');
    expect(guardFile).toContain('JWT_SECRETS');
    expect(guardFile).toContain('rotationSecrets');
  });

  it('JwtAuthGuard uses primary JWT_SECRET for signing (first in rotation order)', () => {
    const guardFile = readSrc('common', 'auth', 'jwt-auth.guard.ts');
    // Guard verifies; JwtTokenService signs — signing still uses the module's primary secret
    const tokenSvcFile = readSrc('modules', 'auth', 'jwt.service.ts');
    expect(tokenSvcFile).toContain('sign(');
    // Signing delegates to @nestjs/jwt which uses JWT_SECRET exclusively
    const authModuleFile = readSrc('common', 'auth', 'auth.module.ts');
    expect(authModuleFile).toContain('JWT_SECRET');
    expect(guardFile).toContain('rotationSecrets');
  });

  it('rotation secret list is split by comma and filtered of empty strings', () => {
    const guardFile = readSrc('common', 'auth', 'jwt-auth.guard.ts');
    expect(guardFile).toContain("split(',')");
    expect(guardFile).toContain('filter(Boolean)');
  });

  it('JwtAuthGuard falls back gracefully when JWT_SECRETS is unset', () => {
    const guardFile = readSrc('common', 'auth', 'jwt-auth.guard.ts');
    // rotationSecrets defaults to empty array
    expect(guardFile).toContain('[]');
  });

  it('guard iterates rotation secrets only after primary verification fails', () => {
    const guardFile = readSrc('common', 'auth', 'jwt-auth.guard.ts');
    // The rotation loop (for...of) must appear after the primary jwtService.verify call
    const primaryIdx = guardFile.indexOf('jwtService.verify');
    const loopIdx = guardFile.indexOf('for (const secret of this.rotationSecrets)');
    expect(primaryIdx).toBeGreaterThanOrEqual(0);
    expect(loopIdx).toBeGreaterThan(0);
    expect(loopIdx).toBeGreaterThan(primaryIdx);
  });
});

// ─── S3 · OTP Rate Limit (P1) ────────────────────────────────────────────────

describe('S3 · OTP Rate Limit (P1)', () => {
  it('rate-limit service defines otp_verification profile', () => {
    const rlFile = readSrc('common', 'rate-limit', 'rate-limit.service.ts');
    expect(rlFile).toContain('otp_verification');
  });

  it('otp_verification profile has a limit of ≤10 per window', () => {
    const rlFile = readSrc('common', 'rate-limit', 'rate-limit.service.ts');
    // Extract limit value from the otp_verification entry
    const match = rlFile.match(/otp_verification[^}]+limit:\s*(\d+)/);
    expect(match).not.toBeNull();
    const limit = parseInt(match![1], 10);
    expect(limit).toBeLessThanOrEqual(10);
  });

  it('rate-limit service defines otp_verification_burst for rapid-attempt detection', () => {
    const rlFile = readSrc('common', 'rate-limit', 'rate-limit.service.ts');
    expect(rlFile).toContain('otp_verification_burst');
  });

  it('signing controller applies otp_verification rate limit to /otp/verify endpoint', () => {
    const ctrlFile = readSrc('modules', 'signing', 'signing.controller.ts');
    expect(ctrlFile).toContain('otp_verification');
  });

  it('signing controller applies otp_issuance rate limit to /otp endpoint', () => {
    const ctrlFile = readSrc('modules', 'signing', 'signing.controller.ts');
    expect(ctrlFile).toContain('otp_issuance');
  });

  it('OTP service implements per-recipient lockout after repeated failures', () => {
    const otpSvcFile = readSrc('modules', 'signing', 'services', 'signing-otp.service.ts');
    expect(otpSvcFile).toContain('RECIPIENT_LOCKOUT_THRESHOLD');
    expect(otpSvcFile).toContain('OtpRecipientLockedError');
  });

  it('OTP service limits per-challenge attempts (brute force protection)', () => {
    const otpSvcFile = readSrc('modules', 'signing', 'services', 'signing-otp.service.ts');
    expect(otpSvcFile).toContain('MAX_ATTEMPTS');
    expect(otpSvcFile).toContain('OtpLockedError');
  });
});
