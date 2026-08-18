import { buildLogSanitizer } from '../../src/common/logging/log-sanitizer';

// ─── Log sanitizer tests ───────────────────────────────────────────────────────
//
// Verifies that buildLogSanitizer() returns a formatters.log function that:
//   1. Replaces each supported credential pattern with [REDACTED:<rule>]
//   2. Leaves non-credential strings unchanged (no false positives)
//   3. Handles nested objects and arrays
//   4. Does not mutate the input object
//   5. Returns the original reference when nothing changed (fast path)

const sanitize = buildLogSanitizer();

describe('buildLogSanitizer()', () => {
  describe('Stripe keys', () => {
    it('redacts sk_live_ secret key in a message string', () => {
      const result = sanitize({ msg: 'Stripe error: sk_live_AbCdEfGhIjKlMnOpQrSt' });
      expect(result['msg']).toBe('Stripe error: [REDACTED:stripe-live-secret]');
    });

    it('redacts pk_live_ publishable key', () => {
      const result = sanitize({ key: 'pk_live_AbCdEfGhIjKlMnOpQrSt' });
      expect(result['key']).toBe('[REDACTED:stripe-live-publishable]');
    });

    it('redacts whsec_ webhook signing secret', () => {
      const result = sanitize({ secret: 'whsec_AbCdEfGhIjKlMnOpQrSt' });
      expect(result['secret']).toBe('[REDACTED:stripe-webhook-secret]');
    });
  });

  describe('AWS keys', () => {
    it('redacts AKIA access key ID', () => {
      const result = sanitize({ msg: 'aws key: AKIAIOSFODNN7EXAMPLE' });
      expect(result['msg']).toBe('aws key: [REDACTED:aws-access-key-id]');
    });
  });

  describe('Gemini / Google API keys', () => {
    it('redacts AIza... API key', () => {
      const result = sanitize({ token: 'AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz12345678' });
      expect(result['token']).toBe('[REDACTED:gemini-api-key]');
    });
  });

  describe('Bearer tokens', () => {
    it('redacts Bearer token in Authorization-style value', () => {
      const result = sanitize({ auth: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig' });
      expect(result['auth']).toContain('[REDACTED:bearer-token]');
    });
  });

  describe('PEM private keys', () => {
    it('redacts PEM private key header', () => {
      const result = sanitize({ pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...' });
      expect(result['pem']).toContain('[REDACTED:private-key-pem]');
    });
  });

  describe('False positives — safe strings must pass through unchanged', () => {
    it('does not redact a normal log message', () => {
      const obj = { msg: 'User logged in', userId: 'user-123', level: 30 };
      const result = sanitize(obj);
      expect(result).toBe(obj); // same reference — fast path, no allocation
    });

    it('does not redact a short alphanumeric token', () => {
      const result = sanitize({ ref: 'abc123xyz' });
      expect(result['ref']).toBe('abc123xyz');
    });

    it('does not redact a URL with no credential', () => {
      const result = sanitize({ url: 'https://api.example.com/v1/resource' });
      expect(result['url']).toBe('https://api.example.com/v1/resource');
    });
  });

  describe('Deep nesting', () => {
    it('redacts a key nested inside an error object', () => {
      const result = sanitize({
        level: 50,
        msg: 'Stripe call failed',
        error: {
          cause: 'sk_live_AbCdEfGhIjKlMnOpQrSt',
        },
      });
      expect((result['error'] as Record<string, unknown>)['cause']).toBe('[REDACTED:stripe-live-secret]');
    });

    it('redacts a key inside an array value', () => {
      const result = sanitize({
        tokens: ['safe-value', 'sk_live_AbCdEfGhIjKlMnOpQrSt'],
      });
      const tokens = result['tokens'] as string[];
      expect(tokens[0]).toBe('safe-value');
      expect(tokens[1]).toBe('[REDACTED:stripe-live-secret]');
    });
  });

  describe('Immutability', () => {
    it('does not mutate the input object when redacting', () => {
      const input = { msg: 'key: sk_live_AbCdEfGhIjKlMnOpQrSt' };
      const original = input.msg;
      sanitize(input);
      expect(input.msg).toBe(original); // original untouched
    });
  });

  describe('Circular references', () => {
    // Regression test: pino-http logs the raw HTTP request object, which can
    // contain genuine cycles (e.g. req.socket referencing structures that
    // loop back to req). Without a cycle guard, sanitizeValue recursed
    // infinitely and crashed the whole process with a RangeError — this must
    // never happen no matter what shape reaches the logger.
    it('does not crash on a self-referencing object', () => {
      const obj: Record<string, unknown> = { msg: 'sk_live_AbCdEfGhIjKlMnOpQrSt' };
      obj['self'] = obj;
      expect(() => sanitize(obj)).not.toThrow();
      const result = sanitize(obj);
      expect(result['msg']).toBe('[REDACTED:stripe-live-secret]');
      expect(result['self']).toBe('[Circular]');
    });

    it('does not crash on a cycle nested inside an array', () => {
      const inner: Record<string, unknown> = {};
      const arr: unknown[] = [inner];
      inner['loop'] = arr;
      expect(() => sanitize({ arr })).not.toThrow();
    });

    it('still sanitizes a value shared (non-circularly) from two branches', () => {
      // Same object reachable from two different, non-overlapping paths —
      // a DAG, not a cycle. Must be walked normally, not flagged as circular.
      const shared = { secret: 'sk_live_AbCdEfGhIjKlMnOpQrSt' };
      const result = sanitize({ a: shared, b: shared });
      expect((result['a'] as Record<string, unknown>)['secret']).toBe('[REDACTED:stripe-live-secret]');
      expect((result['b'] as Record<string, unknown>)['secret']).toBe('[REDACTED:stripe-live-secret]');
    });
  });
});
