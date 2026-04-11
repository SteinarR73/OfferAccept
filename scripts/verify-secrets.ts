#!/usr/bin/env ts-node
/**
 * scripts/verify-secrets.ts
 *
 * Verifies that all required environment variables are present and meet
 * minimum quality requirements before the application is permitted to start.
 *
 * Usage:
 *   ts-node scripts/verify-secrets.ts            # exits 0 if valid, 1 if not
 *   node -r ts-node/register scripts/verify-secrets.ts
 *
 * Called in CI/CD before deployment to catch missing secrets early, avoiding
 * a partially-started production pod that fails requests for minutes before
 * operators notice.
 *
 * This script is intentionally standalone (no NestJS, no Prisma) so it runs
 * before the app is built and in any shell context.
 */

import { createHash } from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

type SecretRule = {
  /** Environment variable name */
  name: string;
  /** Human-readable description for error messages */
  description: string;
  /** Whether absence is fatal (true) or just a warning (false) */
  required: boolean;
  /** Minimum string length. Checked only when the variable is present. */
  minLength?: number;
  /** Regex the value must match. Checked only when the variable is present. */
  pattern?: RegExp;
  /** Custom validator. Return null on success, error message on failure. */
  validate?: (value: string) => string | null;
};

// ── Secret rules ──────────────────────────────────────────────────────────────

const RULES: SecretRule[] = [
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string',
    required: true,
    pattern: /^postgres(ql)?:\/\//,
    validate: (v) =>
      v.includes('localhost') && process.env['NODE_ENV'] === 'production'
        ? 'DATABASE_URL points to localhost in production — must be a managed database'
        : null,
  },
  {
    name: 'JWT_SECRET',
    description: 'JWT signing secret (minimum 32 characters; 64 recommended)',
    required: true,
    minLength: 32,
    validate: (v) => {
      if (v.toLowerCase().includes('change-me') || v.toLowerCase().includes('secret') || v === 'your-secret') {
        return 'JWT_SECRET appears to be a placeholder — replace with a random secret';
      }
      if (v.length < 64 && process.env['NODE_ENV'] === 'production') {
        return `JWT_SECRET is ${v.length} characters; production requires at least 64`;
      }
      return null;
    },
  },
  {
    name: 'SIGNING_LINK_SECRET',
    description: 'HMAC secret for signing offer recipient links',
    required: true,
    minLength: 32,
    validate: (v) =>
      v.toLowerCase().includes('change-me')
        ? 'SIGNING_LINK_SECRET appears to be a placeholder'
        : null,
  },
  {
    name: 'WEB_BASE_URL',
    description: 'Frontend base URL (used in emails and CORS)',
    required: true,
    pattern: /^https?:\/\//,
    validate: (v) =>
      v.startsWith('http://') && process.env['NODE_ENV'] === 'production'
        ? 'WEB_BASE_URL uses http:// in production — must be https://'
        : null,
  },
  {
    name: 'REDIS_URL',
    description: 'Redis connection URL for rate limiting',
    required: true,
    pattern: /^rediss?:\/\//,
  },
  {
    name: 'RESEND_API_KEY',
    description: 'Resend email API key',
    required: process.env['EMAIL_PROVIDER'] === 'resend',
    minLength: 10,
  },
  {
    name: 'STRIPE_SECRET_KEY',
    description: 'Stripe secret key for billing operations',
    required: process.env['BILLING_PROVIDER'] === 'stripe',
    validate: (v) => {
      if (!v.startsWith('sk_')) return 'STRIPE_SECRET_KEY must start with sk_';
      if (v.startsWith('sk_test_') && process.env['NODE_ENV'] === 'production') {
        return 'STRIPE_SECRET_KEY is a test key in production — use sk_live_';
      }
      return null;
    },
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    description: 'Stripe webhook HMAC signing secret',
    required: process.env['BILLING_PROVIDER'] === 'stripe',
    validate: (v) =>
      !v.startsWith('whsec_')
        ? 'STRIPE_WEBHOOK_SECRET must start with whsec_'
        : null,
  },
  {
    name: 'WEBHOOK_SECRET_KEY',
    description: 'AES-256 key for encrypting webhook endpoint secrets (64 hex chars)',
    required: process.env['NODE_ENV'] === 'production',
    minLength: 64,
    validate: (v) => {
      if (!/^[0-9a-fA-F]+$/.test(v)) return 'WEBHOOK_SECRET_KEY must be hex characters only';
      if (v.length !== 64) return `WEBHOOK_SECRET_KEY must be exactly 64 hex chars, got ${v.length}`;
      return null;
    },
  },
  // Gemini — optional today; added here so it is validated when present
  {
    name: 'GEMINI_API_KEY',
    description: 'Google Gemini API key (required when AI features are enabled)',
    required: process.env['AI_PROVIDER'] === 'gemini',
    minLength: 10,
    validate: (v) =>
      v.toLowerCase().includes('your-key') || v === 'placeholder'
        ? 'GEMINI_API_KEY appears to be a placeholder'
        : null,
  },
  // AI budget guardrail (Phase 3)
  {
    name: 'AI_DAILY_TOKEN_LIMIT',
    description: 'Daily token budget for AI calls (positive integer)',
    required: false,
    validate: (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n <= 0) return 'AI_DAILY_TOKEN_LIMIT must be a positive integer';
      return null;
    },
  },
];

// ── Validation runner ─────────────────────────────────────────────────────────

interface ValidationResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  // SHA-256 prefix of the value (non-sensitive, useful for rotation tracking)
  fingerprint?: string;
}

function validateSecrets(): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const rule of RULES) {
    const value = process.env[rule.name];

    if (!value || value.trim() === '') {
      if (rule.required) {
        results.push({
          name: rule.name,
          status: 'error',
          message: `Missing required secret: ${rule.description}`,
        });
      }
      // Optional and absent — silently skip
      continue;
    }

    // Length check
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      results.push({
        name: rule.name,
        status: 'error',
        message: `${rule.name} is too short (${value.length} chars, minimum ${rule.minLength})`,
        fingerprint: sha256Prefix(value),
      });
      continue;
    }

    // Pattern check
    if (rule.pattern && !rule.pattern.test(value)) {
      results.push({
        name: rule.name,
        status: 'error',
        message: `${rule.name} does not match expected format (${rule.pattern})`,
        fingerprint: sha256Prefix(value),
      });
      continue;
    }

    // Custom validator
    if (rule.validate) {
      const error = rule.validate(value);
      if (error) {
        results.push({
          name: rule.name,
          status: 'error',
          message: `${rule.name}: ${error}`,
          fingerprint: sha256Prefix(value),
        });
        continue;
      }
    }

    results.push({
      name: rule.name,
      status: 'ok',
      message: `${rule.name} — OK`,
      fingerprint: sha256Prefix(value),
    });
  }

  return results;
}

function sha256Prefix(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8);
}

// ── Output ────────────────────────────────────────────────────────────────────

const results = validateSecrets();
const errors   = results.filter((r) => r.status === 'error');
const warnings = results.filter((r) => r.status === 'warning');
const ok       = results.filter((r) => r.status === 'ok');

const env = process.env['NODE_ENV'] ?? 'unknown';
console.log(`\nSecret validation — NODE_ENV=${env}\n`);

for (const r of ok) {
  console.log(`  ✅  ${r.message}${r.fingerprint ? ` [sha256:${r.fingerprint}…]` : ''}`);
}
for (const r of warnings) {
  console.warn(`  ⚠️   ${r.message}`);
}
for (const r of errors) {
  console.error(`  ❌  ${r.message}`);
}

console.log(`\nResult: ${ok.length} ok, ${warnings.length} warnings, ${errors.length} errors\n`);

if (errors.length > 0) {
  console.error('❌ Secret validation FAILED. Fix the errors above before starting the application.\n');
  process.exit(1);
}

console.log('✅ All required secrets validated.\n');
process.exit(0);
