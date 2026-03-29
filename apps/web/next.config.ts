import type { NextConfig } from 'next';

let withSentryConfig: (config: NextConfig, opts?: object) => NextConfig;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
} catch {
  withSentryConfig = (config) => config;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    allowedDevOrigins: ['192.168.128.1'],
    // Required by Next.js 15 for the instrumentation hook
    instrumentationHook: true,
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
