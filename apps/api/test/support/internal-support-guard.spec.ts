import { jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InternalSupportGuard } from '../../src/common/auth/internal-support.guard';
import type { JwtPayload } from '../../src/common/auth/jwt-auth.guard';

// ─── InternalSupportGuard — unit tests ────────────────────────────────────────
//
// Tests all security checks:
//   1. JWT validation (delegates to JwtAuthGuard)
//   2. INTERNAL_SUPPORT role requirement
//   3. IP allowlist (SUPPORT_IP_ALLOWLIST)
//   4. Session TTL (SUPPORT_SESSION_TTL_MINUTES)
//   5. MFA claim (REQUIRE_SUPPORT_MFA)

const NOW_SECS = Math.floor(Date.now() / 1000);

const BASE_USER: JwtPayload = {
  sub: 'user-support-1',
  orgId: 'org-1',
  role: 'INTERNAL_SUPPORT',
  iat: NOW_SECS - 60, // issued 60 s ago
  exp: NOW_SECS + 3600,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<any, true> {
  const defaults: Record<string, unknown> = {
    SUPPORT_IP_ALLOWLIST: undefined,
    SUPPORT_SESSION_TTL_MINUTES: undefined,
    REQUIRE_SUPPORT_MFA: false,
    ...overrides,
  };
  return {
    get: jest.fn(<K extends string>(key: K, _opts?: unknown) => defaults[key] as unknown),
    getOrThrow: jest.fn(<K extends string>(key: K) => {
      const v = defaults[key];
      if (v === undefined) throw new Error(`Missing env: ${key}`);
      return v;
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as ConfigService<any, true>;
}

interface TestSetup {
  guard: InternalSupportGuard;
  // context must be built with the same user the JwtService will return
  makeCtx: (ip?: string) => ExecutionContext;
}

function buildSetup(
  configOverrides: Record<string, unknown> = {},
  userOverrides: Record<string, unknown> = {},
  jwtValid = true,
): TestSetup {
  const user = { ...BASE_USER, ...userOverrides };

  const jwtService: JwtService = {
    verify: jwtValid
      ? jest.fn().mockReturnValue(user)
      : jest.fn<() => never>().mockImplementation(() => { throw new Error('invalid'); }),
    sign: jest.fn(),
  } as unknown as JwtService;

  const guard = new InternalSupportGuard(jwtService, makeConfig(configOverrides));

  const makeCtx = (ip = '10.0.0.1'): ExecutionContext => {
    const request = {
      cookies: {},
      headers: { authorization: 'Bearer fake-test-token' },
      socket: { remoteAddress: ip },
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };

  return { guard, makeCtx };
}

// ── Role check ─────────────────────────────────────────────────────────────────

describe('InternalSupportGuard — role check', () => {
  it('allows INTERNAL_SUPPORT users', () => {
    const { guard, makeCtx } = buildSetup({}, { role: 'INTERNAL_SUPPORT' });
    expect(guard.canActivate(makeCtx())).toBe(true);
  });

  it('throws ForbiddenException for OWNER role', () => {
    const { guard, makeCtx } = buildSetup({}, { role: 'OWNER' });
    expect(() => guard.canActivate(makeCtx())).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for ADMIN role', () => {
    const { guard, makeCtx } = buildSetup({}, { role: 'ADMIN' });
    expect(() => guard.canActivate(makeCtx())).toThrow(ForbiddenException);
  });

  it('throws UnauthorizedException when JWT is invalid', () => {
    const { guard, makeCtx } = buildSetup({}, {}, false);
    expect(() => guard.canActivate(makeCtx())).toThrow(UnauthorizedException);
  });
});

// ── IP allowlist ───────────────────────────────────────────────────────────────

describe('InternalSupportGuard — IP allowlist (SUPPORT_IP_ALLOWLIST)', () => {
  it('allows request when IP is in allowlist', () => {
    const { guard, makeCtx } = buildSetup({ SUPPORT_IP_ALLOWLIST: '10.0.0.1,10.0.0.2' });
    expect(guard.canActivate(makeCtx('10.0.0.1'))).toBe(true);
  });

  it('allows the second IP in the allowlist', () => {
    const { guard, makeCtx } = buildSetup({ SUPPORT_IP_ALLOWLIST: '10.0.0.1,10.0.0.2' });
    expect(guard.canActivate(makeCtx('10.0.0.2'))).toBe(true);
  });

  it('blocks request when IP is not in allowlist', () => {
    const { guard, makeCtx } = buildSetup({ SUPPORT_IP_ALLOWLIST: '10.0.0.1,10.0.0.2' });
    expect(() => guard.canActivate(makeCtx('192.168.1.1'))).toThrow(ForbiddenException);
  });

  it('allows request when SUPPORT_IP_ALLOWLIST is not configured', () => {
    const { guard, makeCtx } = buildSetup({ SUPPORT_IP_ALLOWLIST: undefined });
    expect(guard.canActivate(makeCtx('203.0.113.5'))).toBe(true);
  });

  it('handles whitespace around IP addresses', () => {
    const { guard, makeCtx } = buildSetup({ SUPPORT_IP_ALLOWLIST: ' 10.0.0.1 , 10.0.0.2 ' });
    expect(guard.canActivate(makeCtx('10.0.0.1'))).toBe(true);
  });
});

// ── Session TTL ────────────────────────────────────────────────────────────────

describe('InternalSupportGuard — session TTL (SUPPORT_SESSION_TTL_MINUTES)', () => {
  it('allows fresh session within TTL', () => {
    const recentIat = NOW_SECS - 60; // 1 min ago
    const { guard, makeCtx } = buildSetup({ SUPPORT_SESSION_TTL_MINUTES: 60 }, { iat: recentIat });
    expect(guard.canActivate(makeCtx())).toBe(true);
  });

  it('blocks expired session exceeding TTL', () => {
    const oldIat = NOW_SECS - 3601; // 1 h + 1 s ago
    const { guard, makeCtx } = buildSetup({ SUPPORT_SESSION_TTL_MINUTES: 60 }, { iat: oldIat });
    expect(() => guard.canActivate(makeCtx())).toThrow(ForbiddenException);
  });

  it('does not enforce TTL when SUPPORT_SESSION_TTL_MINUTES is not configured', () => {
    const oldIat = NOW_SECS - 86400; // 24 h ago
    const { guard, makeCtx } = buildSetup({ SUPPORT_SESSION_TTL_MINUTES: undefined }, { iat: oldIat });
    expect(guard.canActivate(makeCtx())).toBe(true);
  });

  it('does not enforce TTL when iat is absent from JWT', () => {
    const { guard, makeCtx } = buildSetup({ SUPPORT_SESSION_TTL_MINUTES: 60 }, { iat: undefined });
    expect(guard.canActivate(makeCtx())).toBe(true);
  });
});

// ── MFA claim ─────────────────────────────────────────────────────────────────

describe('InternalSupportGuard — MFA claim (REQUIRE_SUPPORT_MFA)', () => {
  it('allows request with mfaVerifiedAt when REQUIRE_SUPPORT_MFA=true', () => {
    const { guard, makeCtx } = buildSetup(
      { REQUIRE_SUPPORT_MFA: true },
      { mfaVerifiedAt: NOW_SECS - 300 },
    );
    expect(guard.canActivate(makeCtx())).toBe(true);
  });

  it('blocks request without mfaVerifiedAt when REQUIRE_SUPPORT_MFA=true', () => {
    const { guard, makeCtx } = buildSetup({ REQUIRE_SUPPORT_MFA: true });
    expect(() => guard.canActivate(makeCtx())).toThrow(ForbiddenException);
  });

  it('allows request without mfaVerifiedAt when REQUIRE_SUPPORT_MFA=false', () => {
    const { guard, makeCtx } = buildSetup({ REQUIRE_SUPPORT_MFA: false });
    expect(guard.canActivate(makeCtx())).toBe(true);
  });
});

// ── Combined: all checks must pass ────────────────────────────────────────────

describe('InternalSupportGuard — all checks combined', () => {
  it('allows request that passes all configured checks', () => {
    const { guard, makeCtx } = buildSetup(
      {
        SUPPORT_IP_ALLOWLIST: '10.0.0.1',
        SUPPORT_SESSION_TTL_MINUTES: 480,
        REQUIRE_SUPPORT_MFA: true,
      },
      { iat: NOW_SECS - 60, mfaVerifiedAt: NOW_SECS - 300 },
    );
    expect(guard.canActivate(makeCtx('10.0.0.1'))).toBe(true);
  });

  it('IP check fires even when session and MFA are valid', () => {
    const { guard, makeCtx } = buildSetup(
      {
        SUPPORT_IP_ALLOWLIST: '10.0.0.1',
        SUPPORT_SESSION_TTL_MINUTES: 480,
        REQUIRE_SUPPORT_MFA: true,
      },
      { iat: NOW_SECS - 60, mfaVerifiedAt: NOW_SECS - 300 },
    );
    expect(() => guard.canActivate(makeCtx('9.9.9.9'))).toThrow(ForbiddenException);
  });
});
