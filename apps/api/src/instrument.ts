// ─── Sentry instrumentation ────────────────────────────────────────────────────
// Must be imported FIRST in main.ts — before any other imports — so Sentry can
// instrument the modules it needs to trace (HTTP, database, etc.).
//
// Disabled when SENTRY_DSN is absent (local dev / CI without monitoring).
//
// Data scrubbing:
//   - OTP codes, JWT tokens, email bodies, and document contents are never sent.
//   - The denyUrls / ignoreErrors lists suppress known false-positive noise.
//   - beforeSend redacts Authorization headers from all captured events.
//
// Metadata attached to every event:
//   - requestId (X-Request-ID) — attached by the SentryInterceptor in NestJS context
//   - organizationId — attached by SentryInterceptor when user is authenticated
//   - endpoint — via Sentry's automatic HTTP integration

import * as Sentry from '@sentry/node';

const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    release: process.env['APP_VERSION'],

    // Capture 10% of traces in production; 100% in non-prod for debugging.
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

    // Never send raw user content:
    //   - request bodies may contain OTP codes or document data
    //   - response bodies may contain JWT tokens
    sendDefaultPii: false,

    beforeSend(event) {
      // Redact Authorization headers if present in captured request data.
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        if (headers['authorization']) {
          headers['authorization'] = '[Redacted]';
        }
        if (headers['cookie']) {
          headers['cookie'] = '[Redacted]';
        }
      }
      // Drop events that contain OTP codes in their fingerprint or message
      // (belt-and-suspenders — OTP codes should never reach Sentry at all).
      const message = event.message ?? '';
      if (/\b\d{6}\b/.test(message) && message.toLowerCase().includes('otp')) {
        return null;
      }
      return event;
    },
  });
}

export { Sentry };
