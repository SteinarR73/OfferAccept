import { NextRequest, NextResponse } from 'next/server';

// ─── Route protection middleware ───────────────────────────────────────────────
// Runs on the Edge runtime before any dashboard route is rendered.
//
// Strategy:
//   The `oa_sess` cookie is a non-HttpOnly indicator set by the server on login
//   and cleared on logout. It is readable here (Edge runtime cannot read HttpOnly
//   cookies). Its presence signals that the user has an active session.
//   The actual authentication is enforced by JwtAuthGuard on every API request —
//   this middleware is an early redirect to improve UX, not the security boundary.
//
// Protected prefix: /dashboard
//   Unauthenticated → redirect to /login?next=<original path>
//   The login page reads the `next` param to redirect back after auth.

export const config = {
  matcher: ['/dashboard/:path*'],
};

export function middleware(request: NextRequest): NextResponse {
  const sessionIndicator = request.cookies.get('oa_sess');

  if (!sessionIndicator?.value) {
    const loginUrl = new URL('/login', request.url);
    // Pass the original path so the login page can redirect back after auth.
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
