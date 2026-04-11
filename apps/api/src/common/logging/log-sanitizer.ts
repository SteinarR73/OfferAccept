/**
 * log-sanitizer.ts
 *
 * Pino formatters.log function that walks every log object before emission
 * and replaces credential-pattern matches with a [REDACTED:<rule>] token.
 *
 * Why this is necessary alongside pino's built-in `redact`:
 *   pino `redact` works on JSON paths (e.g. 'req.headers.authorization').
 *   It cannot detect a Stripe key that ends up inside an error message, a
 *   request body value, a third-party SDK response, or any dynamically keyed
 *   field.  Pattern-based sanitization covers those cases.
 *
 * Usage (app.module.ts):
 *   import { buildLogSanitizer } from './common/logging/log-sanitizer';
 *   LoggerModule.forRoot({ pinoHttp: { formatters: { log: buildLogSanitizer() } } })
 *
 * Performance:
 *   JSON.stringify + regex scan is O(n) in the size of the serialised log
 *   object.  pino calls formatters.log once per log entry on the hot path.
 *   In production, log entries are small (structured objects, not stack dumps)
 *   so overhead is negligible.  In a high-throughput service consider pushing
 *   redaction into a pino transport so the main thread is not blocked.
 */

// ── Detection rules ──────────────────────────────────────────────────────────

interface SanitizeRule {
  name:    string;
  pattern: RegExp;
}

// These patterns intentionally mirror scripts/secret-scan.ts.
// Keep the two files in sync when adding new credential types.
const RULES: SanitizeRule[] = [
  { name: 'stripe-live-secret',      pattern: /sk_live_[A-Za-z0-9]{20,}/g },
  { name: 'stripe-live-publishable', pattern: /pk_live_[A-Za-z0-9]{20,}/g },
  { name: 'stripe-webhook-secret',   pattern: /whsec_[A-Za-z0-9]{20,}/g },
  { name: 'aws-access-key-id',       pattern: /AKIA[A-Z0-9]{16}/g },
  // Google API keys are "AIza" + exactly 35 alphanumeric chars; use {35,} to
  // avoid leaving a trailing character when the surrounding string is longer.
  { name: 'gemini-api-key',          pattern: /AIza[A-Za-z0-9_\-]{35,}/g },
  // Bearer tokens: match non-whitespace after "Bearer " (covers JWT dot-segments
  // and any other opaque credential format delivered as a bearer credential).
  { name: 'bearer-token',            pattern: /Bearer\s+\S{40,}/g },
  // Private key PEM headers — should never appear in logs
  { name: 'private-key-pem',         pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

// ── Core sanitizer ────────────────────────────────────────────────────────────

/**
 * Sanitize a single string value by replacing all credential pattern matches.
 * Returns the original string unchanged if no patterns match (zero-alloc fast path).
 */
function sanitizeString(value: string): string {
  let result = value;
  for (const rule of RULES) {
    // Reset lastIndex before each test (global flag + shared regex = stateful)
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(value)) {
      rule.pattern.lastIndex = 0;
      result = result.replace(rule.pattern, `[REDACTED:${rule.name}]`);
    }
  }
  return result;
}

/**
 * Deep-walk a log object and sanitize all string leaf values.
 *
 * Handles: plain objects, arrays, strings, numbers, booleans, null, undefined.
 * Does NOT mutate the input — returns a new object when changes are needed.
 * Cycles are not expected in pino log objects; no cycle guard is included.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const result = value.map((item) => {
      const sanitized = sanitizeValue(item);
      if (sanitized !== item) changed = true;
      return sanitized;
    });
    return changed ? result : value;
  }
  if (value !== null && typeof value === 'object') {
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeValue(v);
      if (sanitized !== v) changed = true;
      result[k] = sanitized;
    }
    return changed ? result : value;
  }
  return value;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a pino `formatters.log` function that sanitizes the log object.
 *
 * Example:
 *   Input:  { msg: 'Stripe error: sk_live_abc123...', level: 30 }
 *   Output: { msg: 'Stripe error: [REDACTED:stripe-live-secret]', level: 30 }
 */
export function buildLogSanitizer(): (obj: Record<string, unknown>) => Record<string, unknown> {
  return function sanitizeLog(obj: Record<string, unknown>): Record<string, unknown> {
    return sanitizeValue(obj) as Record<string, unknown>;
  };
}
