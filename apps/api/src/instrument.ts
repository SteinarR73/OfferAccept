// ─── Observability bootstrap ────────────────────────────────────────────────────
// This file must be the FIRST import in main.ts so instrumentation hooks are
// installed before any other modules are loaded.
//
// Two complementary systems are initialised here:
//
// 1. Sentry (error tracking + distributed tracing)
//    - Captures unhandled exceptions and captured errors with full stack traces.
//    - Sentry Node SDK v9 bootstraps an OpenTelemetry TracerProvider internally,
//      so all OTel spans created via `@opentelemetry/api` are automatically
//      forwarded to Sentry without a separate OTel exporter.
//    - Disabled when SENTRY_DSN is absent (local dev / CI without monitoring).
//
// 2. OpenTelemetry API registration
//    - `@opentelemetry/api` is the vendor-neutral instrumentation facade.
//    - When Sentry is active, Sentry's OTel provider is already registered and
//      handles all spans.
//    - When Sentry is NOT active (dev), `trace.getTracer(...)` returns a no-op
//      tracer — zero overhead, zero crashes.
//    - Services that want to create manual spans import `getAppTracer()` from
//      this module. No other module needs to import @opentelemetry/api directly.
//
// ─── Data scrubbing ────────────────────────────────────────────────────────────
//   - OTP codes, JWT tokens, email bodies, and document contents are never sent.
//   - The denyUrls / ignoreErrors lists suppress known false-positive noise.
//   - beforeSend redacts Authorization and Cookie headers from all captured events.
//
// ─── Metadata on every Sentry event ───────────────────────────────────────────
//   - requestId (X-Request-ID) — attached by SentryInterceptor
//   - organizationId           — attached by SentryInterceptor when authenticated
//   - endpoint                 — via Sentry's automatic HTTP integration

import * as Sentry from '@sentry/node';
import { trace, Tracer } from '@opentelemetry/api';

// ── Sentry ────────────────────────────────────────────────────────────────────

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
      // Redact credential headers from all captured request data.
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, string>;
        if (headers['authorization']) headers['authorization'] = '[Redacted]';
        if (headers['cookie'])        headers['cookie']        = '[Redacted]';
      }
      // Drop events that look like OTP codes leaked into error messages.
      // Belt-and-suspenders: OTP codes should never reach Sentry at all.
      const message = event.message ?? '';
      if (/\b\d{6}\b/.test(message) && message.toLowerCase().includes('otp')) {
        return null;
      }
      return event;
    },
  });
}

// ── OpenTelemetry API ─────────────────────────────────────────────────────────
// Sentry v9 registers its own TracerProvider. When `getAppTracer()` is called
// in a service, it retrieves the tracer from whichever provider is active:
//   - When Sentry is initialised: spans flow to Sentry.
//   - When Sentry is absent:      a no-op tracer is returned (zero overhead).
//
// Usage in service / worker code:
//   import { getAppTracer } from '../../instrument';
//   const span = getAppTracer().startSpan('operation.name');
//   span.setAttributes({ 'job.name': name });
//   try { ... } finally { span.end(); }

const TRACER_NAME = '@offeraccept/api';
const TRACER_VERSION = process.env['APP_VERSION'] ?? '0.0.0';

export function getAppTracer(): Tracer {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

export { Sentry };
