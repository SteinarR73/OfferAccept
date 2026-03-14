import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enforce strict mode for catching potential issues early
  reactStrictMode: true,

  // API calls from the browser are proxied through Next.js rewrites in
  // development. In production, the API sits on its own domain/subdomain.
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

export default nextConfig;
