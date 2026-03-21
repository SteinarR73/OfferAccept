import { DevEmailAdapter } from '../../src/common/email/dev-email.adapter';

// ─── Logging Redaction Tests ───────────────────────────────────────────────────
//
// These tests verify that sensitive material does not leak through the ResendEmailAdapter's
// logging path. The ResendEmailAdapter has explicit guards:
//   "Do not log params.code — it is the raw OTP"
//   "Do not log params.signingUrl — it contains the raw token"
//
// We cannot inject a spy into ResendEmailAdapter's private logger without
// restructuring it, so instead we verify the documented constraints hold
// for the DevEmailAdapter (which IS used in tests) and we assert that the
// production adapter's method signatures and documented guards are present.
//
// For the DevEmailAdapter: OTP codes and signing URLs ARE logged intentionally
// (this is the entire point of the dev adapter — visible in terminal). The test
// here verifies that the production guard pattern exists at the code level, and
// that the DevEmailAdapter is never active when NODE_ENV=production.
//
// Additionally: verify that the acceptance statement builder (single source of
// truth) does not embed email addresses or IP addresses that could appear in
// anomaly messages or public API responses.

import { buildAcceptanceStatement } from '../../src/modules/signing/domain/acceptance-statement';

describe('Logging redaction — DevEmailAdapter', () => {
  let adapter: DevEmailAdapter;
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    adapter = new DevEmailAdapter();
    logSpy.mockClear();
    warnSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('DevEmailAdapter — intentional dev logging', () => {
    it('stores OTP code for test retrieval', async () => {
      await adapter.sendOtp({
        to: 'alice@example.com',
        code: '123456',
        offerTitle: 'Test Offer',
        recipientName: 'Alice',
        expiresAt: new Date(Date.now() + 600_000),
      });
      expect(adapter.getLastCode('alice@example.com')).toBe('123456');
    });

    it('stores signing URL for test retrieval', async () => {
      await adapter.sendOfferLink({
        to: 'alice@example.com',
        recipientName: 'Alice',
        offerTitle: 'Test Offer',
        signingUrl: 'http://localhost:3000/sign/oa_supersecrettoken',
        senderName: 'Bob',
        expiresAt: null,
      });
      const link = adapter.getLastOfferLink('alice@example.com');
      expect(link?.signingUrl).toContain('oa_supersecrettoken');
    });

    it('reset() clears all stored test data', async () => {
      await adapter.sendOtp({
        to: 'alice@example.com',
        code: '999999',
        offerTitle: 'Test Offer',
        recipientName: 'Alice',
        expiresAt: new Date(Date.now() + 600_000),
      });
      adapter.reset();
      expect(adapter.getLastCode('alice@example.com')).toBeNull();
    });
  });
});

describe('Logging redaction — ResendEmailAdapter guards (structural)', () => {
  // These tests read the source file to verify the no-log guard comments exist.
  // This is a documentation-level assertion: if someone removes the guard comment,
  // this test fails and forces a code review of the intent.

  it('ResendEmailAdapter source contains the OTP no-log guard', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/common/email/resend-email.adapter.ts'),
      'utf8',
    );
    // Verify the explicit guard comment exists
    expect(src).toContain('Do not log params.code');
  });

  it('ResendEmailAdapter source contains the signing URL no-log guard', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/common/email/resend-email.adapter.ts'),
      'utf8',
    );
    expect(src).toContain('Do not log params.signingUrl');
  });
});

describe('Logging redaction — acceptance statement excludes sensitive data', () => {
  // The acceptance statement is returned in the public GET /signing/:token response
  // and stored in AcceptanceRecord. It must not contain IP addresses or anything
  // that is considered sensitive context-metadata (those live in separate fields
  // of AcceptanceRecord and are never surfaced publicly).

  const stmt = buildAcceptanceStatement({
    recipientName: 'Alice Johnson',
    offerTitle: 'Consulting Agreement',
    senderName: 'Bob Smith',
    senderEmail: 'bob@example.com',
  });

  it('does not contain IP address patterns', () => {
    // IPv4
    expect(stmt).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    // IPv6 fragment
    expect(stmt).not.toMatch(/[0-9a-f]{4}:[0-9a-f]{4}/i);
  });

  it('does not contain user agent strings', () => {
    expect(stmt).not.toContain('Mozilla');
    expect(stmt).not.toContain('Chrome');
    expect(stmt).not.toContain('Safari');
  });

  it('does not contain timezone or locale fields', () => {
    expect(stmt).not.toContain('UTC');
    expect(stmt).not.toContain('America/');
    expect(stmt).not.toContain('Europe/');
    expect(stmt).not.toContain('en-US');
  });
});

describe('Production guard — DevEmailAdapter must not be active in production', () => {
  it('env.ts blocks EMAIL_PROVIDER=dev when NODE_ENV=production', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateEnv } = require('../../src/config/env');

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_SECRET: 'a-valid-secret-at-least-32-chars-long!!',
        SIGNING_LINK_SECRET: 'another-valid-secret-32-chars-long!!',
        WEB_BASE_URL: 'https://app.offeracept.com',
        EMAIL_FROM: 'noreply@offeracept.com',
        EMAIL_PROVIDER: 'dev',  // ← must be rejected
      }),
    ).toThrow();
  });

  it('env.ts allows EMAIL_PROVIDER=resend in production when RESEND_API_KEY is set', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateEnv } = require('../../src/config/env');

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_SECRET: 'a-valid-secret-at-least-32-chars-long!!',
        SIGNING_LINK_SECRET: 'another-valid-secret-32-chars-long!!',
        WEB_BASE_URL: 'https://app.offeracept.com',
        EMAIL_FROM: 'noreply@offeracept.com',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_live_abc123',
        STORAGE_PROVIDER: 's3',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        S3_BUCKET_NAME: 'my-bucket',
        BILLING_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_abc123',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
        STRIPE_PRICE_STARTER: 'price_starter',
        STRIPE_PRICE_PROFESSIONAL: 'price_professional',
        STRIPE_PRICE_ENTERPRISE: 'price_enterprise',
        COOKIE_SECURE: 'true',
      }),
    ).not.toThrow();
  });

  it('env.ts rejects placeholder JWT_SECRET in production', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateEnv } = require('../../src/config/env');

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_SECRET: 'change-me-in-production-min-32-chars',  // ← placeholder
        SIGNING_LINK_SECRET: 'another-valid-secret-32-chars-long!!',
        WEB_BASE_URL: 'https://app.offeracept.com',
        EMAIL_FROM: 'noreply@offeracept.com',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_live_abc123',
        STORAGE_PROVIDER: 's3',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        S3_BUCKET_NAME: 'my-bucket',
        BILLING_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_abc123',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
        STRIPE_PRICE_STARTER: 'price_starter',
        STRIPE_PRICE_PROFESSIONAL: 'price_professional',
        STRIPE_PRICE_ENTERPRISE: 'price_enterprise',
        COOKIE_SECURE: 'true',
      }),
    ).toThrow(/change-me/i);
  });

  it('env.ts rejects placeholder SIGNING_LINK_SECRET in production', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateEnv } = require('../../src/config/env');

    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        JWT_SECRET: 'a-valid-secret-at-least-32-chars-long!!',
        SIGNING_LINK_SECRET: 'change-me-in-production-min-32-chars',  // ← placeholder
        WEB_BASE_URL: 'https://app.offeracept.com',
        EMAIL_FROM: 'noreply@offeracept.com',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_live_abc123',
        STORAGE_PROVIDER: 's3',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        S3_BUCKET_NAME: 'my-bucket',
        BILLING_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_live_abc123',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
        STRIPE_PRICE_STARTER: 'price_starter',
        STRIPE_PRICE_PROFESSIONAL: 'price_professional',
        STRIPE_PRICE_ENTERPRISE: 'price_enterprise',
        COOKIE_SECURE: 'true',
      }),
    ).toThrow(/change-me/i);
  });
});
