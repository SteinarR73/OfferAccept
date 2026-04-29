import { NextRequest, NextResponse } from 'next/server';

// ─── CSP nonce + route protection middleware ───────────────────────────────────
// Runs on the Edge runtime for every HTML page request.
//
// 1. Nonce-based CSP — replaces the static unsafe-inline in next.config.ts.
//    A fresh cryptographic nonce is generated per request. Next.js 15 App Router
//    reads the x-nonce request header and attaches it to its own inline scripts,
//    removing the need for unsafe-inline in script-src.
//
// 2. Dashboard protection — redirects unauthenticated users to /login.
//    The `oa_sess` cookie is a non-HttpOnly indicator set on login and cleared on
//    logout. It is readable on the Edge; the actual auth boundary is JwtAuthGuard
//    on every API request.

// Static portions of the CSP — concatenated with the per-request nonce below.
const CSP_PARTS = {
  default: "default-src 'self'",
  style:   "style-src 'self' 'unsafe-inline'",        // Tailwind v4 + Next.js require this
  img:     "img-src 'self' data:",
  connect: "connect-src 'self' https://*.ingest.sentry.io",
  font:    "font-src 'self'",
  frame:   "frame-ancestors 'none'",
  base:    "base-uri 'self'",
  form:    "form-action 'self'",
};

function buildCsp(nonce: string): string {
  return [
    CSP_PARTS.default,
    `script-src 'self' 'nonce-${nonce}'`,
    CSP_PARTS.style,
    CSP_PARTS.img,
    CSP_PARTS.connect,
    CSP_PARTS.font,
    CSP_PARTS.frame,
    CSP_PARTS.base,
    CSP_PARTS.form,
  ].join('; ');
}

// Matches all page routes, excluding Next.js internals and static assets.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

export function middleware(request: NextRequest): NextResponse {
  // Generate a fresh nonce for each request. Buffer.from(crypto.randomUUID())
  // gives 128 bits of randomness encoded in base64 — sufficient for a CSP nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp   = buildCsp(nonce);

  // ── Dashboard auth gate ───────────────────────────────────────────────────────
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith('/dashboard');
  const sessionIndicator = request.cookies.get('oa_sess');

  if (isDashboard && !sessionIndicator?.value) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  // ── Pass nonce to server components and set CSP response header ───────────────
  // x-nonce is read by the root layout (and any nested server components) via
  // next/headers so they can attach the nonce to <Script nonce={nonce}> elements.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
