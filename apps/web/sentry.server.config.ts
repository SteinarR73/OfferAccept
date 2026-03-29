import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_APP_VERSION,

    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['Authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['Cookie'];
      }
      // Drop events that may contain OTP codes
      if (event.message && /\b\d{6}\b/.test(event.message)) {
        return null;
      }
      return event;
    },

    initialScope: {
      tags: { service: 'web' },
    },
  });
}
