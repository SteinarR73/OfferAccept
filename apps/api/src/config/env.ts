import { z } from 'zod';

// Validates all required environment variables at startup.
// The app will refuse to start with a clear error if anything is missing.

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url(),
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
    (data) =>
      data.NODE_ENV !== 'production' ||
      !data.JWT_SECRET.includes('change-me'),
    {
      message: 'JWT_SECRET appears to be the default placeholder. Replace it before running in production.',
      path: ['JWT_SECRET'],
    },
  )
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      !data.SIGNING_LINK_SECRET.includes('change-me'),
    {
      message: 'SIGNING_LINK_SECRET appears to be the default placeholder. Replace it before running in production.',
      path: ['SIGNING_LINK_SECRET'],
    },
  )
  .refine(
    (data) => data.NODE_ENV !== 'production' || data.COOKIE_SECURE === true,
    {
      message: 'COOKIE_SECURE must be true in production. Cookies must be served over HTTPS only.',
      path: ['COOKIE_SECURE'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ Invalid environment variables:', JSON.stringify(formatted, null, 2));
    throw new Error('Invalid environment configuration. See above for details.');
  }

  return result.data;
}
