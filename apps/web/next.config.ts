import type { NextConfig } from 'next';

let withSentryConfig: (config: NextConfig, opts?: object) => NextConfig;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
} catch {
  withSentryConfig = (config) => config;
}

// ── Security headers ──────────────────────────────────────────────────────────
// Applied to all responses via headers() — covers static assets, HTML pages, and
// API proxy responses. CSP is intentionally excluded here: it is set per-request
// by middleware.ts with a fresh cryptographic nonce so script-src can omit
// unsafe-inline. Static assets and non-page routes do not need CSP.
//
//   X-Content-Type-Options: prevents MIME-type sniffing — browsers must honour
//     the declared Content-Type, closing content-sniffing attack vectors.
//
//   Referrer-Policy: strict-origin-when-cross-origin — sends the full URL for
//     same-origin requests (useful for analytics), sends only the origin for
//     cross-origin requests (prevents leaking URL paths to third parties).
//
//   Permissions-Policy: opt out of browser APIs this app does not use. Prevents
//     a compromised script from silently accessing camera, microphone, or GPS.
//
//   frame-ancestors 'none' (via CSP in middleware) + X-Frame-Options are both
//     set. X-Frame-Options: DENY is kept for old browsers that predate CSP.
//     frame-ancestors in CSP takes precedence in modern browsers.

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Allow cross-origin requests from local dev network interface
  allowedDevOrigins: ['192.168.128.1'],

  // experimental: {} — instrumentationHook is stable in Next.js 15, no longer needed here

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          // Referrer leakage prevention
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          // Disable unused browser APIs
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          // Legacy clickjacking prevention (modern browsers use CSP frame-ancestors)
          { key: 'X-Frame-Options',            value: 'DENY' },
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
