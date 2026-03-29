import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_APP_VERSION,

    // Sample 10% of transactions in production; 100% otherwise
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Never send PII
    sendDefaultPii: false,

    beforeSend(event) {
      // Strip Authorization and Cookie headers from all events
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
      }
      return event;
    },

    // Tag all client-side events
    initialScope: {
      tags: { service: 'web' },
    },
  });
}
