import { z } from 'zod';

// Validates all required environment variables at startup.
// The app will refuse to start with a clear error if anything is missing.

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url(),
    // Redis connection string for the distributed rate limiter.
    // Format: redis[s]://[[username][:password]@][host][:port][/db-number]
    // Defaults to localhost for development. Must point to a shared Redis
    // instance in production — all API pods must use the same URL.
    // Use rediss:// (note double-s) to enable TLS — required for Upstash,
    // Elasticache with TLS, and any externally hosted Redis.
    REDIS_URL: z.string().default('redis://localhost:6379'),
    // Force TLS for Redis even if the URL uses the redis:// scheme.
    // Only needed if your managed Redis requires TLS but the URL doesn't reflect it.
    // Redundant when the URL starts with rediss:// (ioredis handles that automatically).
    REDIS_TLS: z
      .string()
      .transform((v) => v === 'true')
      .default('false'),
    // Timeout for establishing the initial Redis connection (ms).
    // Keep well below 1 s — rate-limit errors must not add latency to API responses.
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(5000).default(500),
    // Per-command timeout (ms). Commands exceeding this are aborted and fail-open.
    REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(100).max(5000).default(500),
    JWT_SECRET: z.string().min(32),
    // Access token TTL (short-lived, delivered as HttpOnly cookie).
    // Must be a value parseable by the jsonwebtoken 'expiresIn' option (e.g. '15m', '1h').
    JWT_ACCESS_TTL: z.string().default('15m'),
    // Refresh token TTL. Used to set Session.expiresAt in the database.
    // Format: number of days (parsed as integer).
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    // Cookie domain — omit for same-origin (localhost dev). Set to '.yourdomain.com' in production.
    COOKIE_DOMAIN: z.string().optional(),
    // Whether to set the Secure flag on cookies. Should be true in production (HTTPS only).
    COOKIE_SECURE: z
      .string()
      .transform((v) => v !== 'false' && v !== '0')
      .default('true'),
    SIGNING_LINK_SECRET: z.string().min(32),
    WEB_BASE_URL: z.string().url(),
    EMAIL_FROM: z.string().email(),
    // Email provider — 'dev' uses in-memory DevEmailAdapter (safe default for local/test).
    // 'resend' uses the Resend API; requires RESEND_API_KEY.
    // See docs/email.md for production configuration guidance.
    EMAIL_PROVIDER: z.enum(['dev', 'resend']).default('dev'),
    RESEND_API_KEY: z.string().optional(),
    // Sentry DSN for error monitoring. Optional — Sentry is disabled when absent.
    SENTRY_DSN: z.string().optional(),
    // Application version reported to Sentry (e.g. git SHA or semver).
    APP_VERSION: z.string().optional(),
    // Storage provider — 'dev' uses in-memory DevStorageAdapter (safe default for local/test).
    // 's3' uses AWS S3; requires AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME.
    STORAGE_PROVIDER: z.enum(['dev', 's3']).default('dev'),
    AWS_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET_NAME: z.string().optional(),
    // Stripe billing — required when BILLING_PROVIDER=stripe.
    // STRIPE_PUBLISHABLE_KEY is not validated here; it is consumed by the frontend.
    // Whether to trust the first X-Forwarded-* hop from a load balancer / reverse proxy.
    // Set to 'true' in production when the API runs behind nginx, ALB, or a similar proxy.
    // Leaving this as 'false' when behind a proxy means req.ip always returns the proxy IP,
    // which breaks IP-based rate limiting (all requests share one bucket).
    TRUST_PROXY: z
      .string()
      .transform((v) => v === 'true')
      .default('false'),
    // CIDR range(s) of trusted upstream proxies, comma-separated (e.g. "10.0.0.0/8").
    // When set, extractClientIp() rejects X-Forwarded-For values that don't originate from
    // these ranges, preventing IP spoofing by end clients.
    // Leave unset to skip CIDR validation (trust all X-Forwarded-For values from the proxy hop).
    TRUSTED_PROXY_CIDR: z.string().optional(),
    // AES-256-GCM key for encrypting sensitive database columns (e.g. webhook secrets).
    // Must be exactly 64 hex characters (32 bytes / 256 bits).
    // Generate one with: openssl rand -hex 32
    // Required in production. Optional in dev/test (encryption is skipped when absent).
    WEBHOOK_SECRET_KEY: z.string().optional(),
    // Rate limiter storage backend.
    // 'redis'  (default) — distributed sliding-window via Lua scripts; required in production.
    // 'memory' — in-process Map; safe for development and unit tests that don't need Redis.
    // NEVER set to 'memory' in production — limits are per-process only.
    RATE_LIMIT_BACKEND: z.enum(['redis', 'memory']).default('redis'),
    // ── Support access hardening ──────────────────────────────────────────────
    // Comma-separated list of IP addresses allowed to access INTERNAL_SUPPORT
    // endpoints. Requests from other IPs receive 403 Forbidden.
    // Leave unset to disable IP restriction (not recommended in production).
    // Example: "10.0.1.5,10.0.1.6"
    SUPPORT_IP_ALLOWLIST: z.string().optional(),
    // Maximum age (in minutes) of an INTERNAL_SUPPORT session.
    // Tokens older than this (based on JWT `iat` claim) are rejected.
    // Leave unset to disable TTL enforcement.
    // Recommended production value: 480 (8 hours).
    SUPPORT_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).optional(),
    // When true, INTERNAL_SUPPORT JWT must contain an `mfaVerifiedAt` claim.
    // Tokens without this claim receive 403 Forbidden.
    REQUIRE_SUPPORT_MFA: z
      .string()
      .transform((v) => v === 'true')
      .default('false'),
    BILLING_PROVIDER: z.enum(['stripe', 'none']).default('none'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // Price IDs for paid plans — required when BILLING_PROVIDER=stripe.
    // Each maps a Stripe Price ID to one of our SubscriptionPlan values.
    STRIPE_PRICE_STARTER: z.string().optional(),
    STRIPE_PRICE_PROFESSIONAL: z.string().optional(),
    STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  })
  .refine(
    (data) =>
      data.EMAIL_PROVIDER !== 'resend' ||
      (!!data.RESEND_API_KEY && data.RESEND_API_KEY.length > 0),
    {
      message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      path: ['RESEND_API_KEY'],
    },
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || data.EMAIL_PROVIDER !== 'dev',
    {
      message:
        'EMAIL_PROVIDER=dev must never be used in production. ' +
        'Set EMAIL_PROVIDER=resend and provide RESEND_API_KEY.',
      path: ['EMAIL_PROVIDER'],
    },
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || data.STORAGE_PROVIDER !== 'dev',
    {
      message:
        'STORAGE_PROVIDER=dev must never be used in production. ' +
        'Set STORAGE_PROVIDER=s3 and provide AWS credentials.',
      path: ['STORAGE_PROVIDER'],
    },
  )
  .refine(
    (data) =>
      data.STORAGE_PROVIDER !== 's3' ||
      (!!data.AWS_REGION && !!data.AWS_ACCESS_KEY_ID && !!data.AWS_SECRET_ACCESS_KEY && !!data.S3_BUCKET_NAME),
    {
      message: 'AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME are required when STORAGE_PROVIDER=s3',
      path: ['STORAGE_PROVIDER'],
    },
  )
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      !data.JWT_SECRET.includes('change-me'),
    {
      message: 'JWT_SECRET contains "change-me" — replace it before running in production.',
      path: ['JWT_SECRET'],
    },
  )
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      !data.SIGNING_LINK_SECRET.includes('change-me'),
    {
      message: 'SIGNING_LINK_SECRET contains "change-me" — replace it before running in production.',
      path: ['SIGNING_LINK_SECRET'],
    },
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || data.COOKIE_SECURE === true,
    {
      message: 'COOKIE_SECURE must be true in production. Cookies must be served over HTTPS only.',
      path: ['COOKIE_SECURE'],
    },
  )
  .refine(
    (data) =>
      data.BILLING_PROVIDER !== 'stripe' ||
      (!!data.STRIPE_SECRET_KEY &&
        !!data.STRIPE_WEBHOOK_SECRET &&
        !!data.STRIPE_PRICE_STARTER &&
        !!data.STRIPE_PRICE_PROFESSIONAL &&
        !!data.STRIPE_PRICE_ENTERPRISE),
    {
      message:
        'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and all STRIPE_PRICE_* vars are required when BILLING_PROVIDER=stripe',
      path: ['BILLING_PROVIDER'],
    },
  )
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      (!!data.WEBHOOK_SECRET_KEY && data.WEBHOOK_SECRET_KEY.length === 64),
    {
      message:
        'WEBHOOK_SECRET_KEY is required in production and must be exactly 64 hex characters. ' +
        'Generate one with: openssl rand -hex 32',
      path: ['WEBHOOK_SECRET_KEY'],
    },
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || data.BILLING_PROVIDER !== 'none',
    {
      message: 'BILLING_PROVIDER=none must not be used in production. Set BILLING_PROVIDER=stripe.',
      path: ['BILLING_PROVIDER'],
    },
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || data.RATE_LIMIT_BACKEND !== 'memory',
    {
      message:
        'RATE_LIMIT_BACKEND=memory must not be used in production. ' +
        'Rate limits are per-process only and will be bypassed under horizontal scaling.',
      path: ['RATE_LIMIT_BACKEND'],
    },
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || data.TRUST_PROXY === true,
    {
      message:
        'TRUST_PROXY must be true in production. ' +
        'Without it, IP-based rate limiting applies to the load balancer IP, not individual clients.',
      path: ['TRUST_PROXY'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ Invalid environment variables:', JSON.stringify(formatted, null, 2));
    const messages = result.error.errors.map((e) => e.message).join('; ');
    throw new Error(`Invalid environment configuration: ${messages}`);
  }

  return result.data;
}
