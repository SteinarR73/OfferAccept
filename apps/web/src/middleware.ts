import { NextRequest, NextResponse } from 'next/server';

// ─── CSP nonce + route protection middleware ───────────────────────────────────
// Runs on the Edge runtime for every HTML page request.
//
// 1. Nonce-based CSP — replaces the static unsafe-inline in next.config.ts.
//    A fresh cryptographic nonce is generated per request. During SSR, Next.js
//    parses the nonce out of this response's own Content-Security-Policy header
//    and attaches it to every script tag it renders (framework runtime, page
//    bundles, hydration data, and any <Script nonce={nonce}> you write) — no
//    extra per-component wiring needed. This depends on one hard requirement:
//    every page must render dynamically (root layout sets `export const
//    dynamic = 'force-dynamic'`), because a nonce only exists once a request
//    exists — a statically-generated page has no nonce to embed at build
//    time, so its CSP-header nonce can never match anything in its (pre-built,
//    nonce-less) HTML and hydration silently fails.
//
//    'strict-dynamic' lets a nonce-authorized script load further scripts
//    (e.g. webpack's dynamic chunk loading) without each one needing its own
//    nonce — required alongside a nonce-based script-src, per Next's own CSP
//    guide. 'unsafe-eval' is dev-only: React's dev build uses eval() for
//    richer error stack traces; it is never included in production.
//
//    connect-src must include the API's own origin: lib/auth.ts and
//    lib/offers-api.ts call NEXT_PUBLIC_API_URL directly (a different origin
//    than the web app whenever they're deployed separately, which is the
//    normal case — see apps/api/Dockerfile). Without this, CSP silently
//    blocked every fetch() the app makes to its own backend.
//
// 2. Dashboard protection — redirects unauthenticated users to /login.
//    The `oa_sess` cookie is a non-HttpOnly indicator set on login and cleared on
//    logout. It is readable on the Edge; the actual auth boundary is JwtAuthGuard
//    on every API request.

const isDev = process.env.NODE_ENV === 'development';

// The API origin the browser actually calls — see lib/auth.ts / lib/offers-api.ts.
// Falls back to no extra origin (same-origin only) if the env var is unset or
// unparseable, rather than throwing at module load.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin;
  } catch {
    return null;
  }
})();

// Static portions of the CSP — concatenated with the per-request nonce below.
const CSP_PARTS = {
  default: "default-src 'self'",
  style:   "style-src 'self' 'unsafe-inline'",        // Tailwind v4 + Next.js require this
  img:     "img-src 'self' data:",
  connect: `connect-src 'self' https://*.ingest.sentry.io${apiOrigin ? ` ${apiOrigin}` : ''}`,
  font:    "font-src 'self'",
  frame:   "frame-ancestors 'none'",
  base:    "base-uri 'self'",
  form:    "form-action 'self'",
  object:  "object-src 'none'",
  upgrade: "upgrade-insecure-requests",
};

function buildCsp(nonce: string): string {
  return [
    CSP_PARTS.default,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    CSP_PARTS.style,
    CSP_PARTS.img,
    CSP_PARTS.connect,
    CSP_PARTS.font,
    CSP_PARTS.frame,
    CSP_PARTS.base,
    CSP_PARTS.form,
    CSP_PARTS.object,
    ...(isDev ? [] : [CSP_PARTS.upgrade]),
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

  // ── Locale detection ─────────────────────────────────────────────────────────
  // /no/* routes serve Norwegian copy + NOK pricing. All other routes are English.
  const { pathname } = request.nextUrl;
  const isNorwegian = pathname.startsWith('/no/') || pathname === '/no';

  // ── Dashboard auth gate ───────────────────────────────────────────────────────
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

  // Persist locale so client components (dashboard) can read it without a
  // round-trip. The cookie is non-sensitive — it only controls display language.
  const currentLocale = request.cookies.get('oa_locale')?.value;
  const targetLocale = isNorwegian ? 'no' : 'en';
  if (currentLocale !== targetLocale) {
    response.cookies.set('oa_locale', targetLocale, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
