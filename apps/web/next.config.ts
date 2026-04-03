import type { NextConfig } from 'next';

let withSentryConfig: (config: NextConfig, opts?: object) => NextConfig;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
} catch {
  withSentryConfig = (config) => config;
}

// ── Content Security Policy ───────────────────────────────────────────────────
// Applied to all routes via the headers() hook.
//
// Notes:
//   script-src 'unsafe-inline': Next.js 15 App Router injects inline scripts
//     for RSC payload and router state. Required for hydration to work without
//     per-request nonces. Nonce-based CSP is a future improvement.
//
//   style-src 'unsafe-inline': Tailwind CSS v4 and Next.js inject <style> blocks
//     at runtime. Cannot be removed without a nonce strategy.
//
//   connect-src includes sentry.io: Sentry browser SDK reports errors there.
//     Set NEXT_PUBLIC_SENTRY_DSN to the ingest URL — same domain will be covered.
//
//   font-src 'self': next/font/google downloads and self-hosts fonts at build
//     time. All font files are served from the same origin in production.
//
//   img-src data:: Next.js and various UI libraries use data: URIs for
//     placeholder images and SVG icons.
//
//   frame-ancestors 'none': prevents the app from being embedded in iframes,
//     closing clickjacking vectors.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  // 'self' covers proxied API calls (/api/*). Sentry ingest for browser SDK.
  "connect-src 'self' https://*.ingest.sentry.io",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    allowedDevOrigins: ['192.168.128.1'],
    // Required by Next.js 15 for the instrumentation hook
    instrumentationHook: true,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: CSP,
          },
        ],
      },
    ];
  },

  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in CI / production builds
  silent: true,
  disableServerWebpackPlugin: !process.env.SENTRY_DSN,
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Prevent Sentry from adding a default error tunnel route
  tunnelRoute: undefined,
});
