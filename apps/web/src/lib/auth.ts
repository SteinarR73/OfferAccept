// ─── Auth utilities (client-side) ─────────────────────────────────────────────
//
// Cookie-based auth model:
//   accessToken  — HttpOnly, SameSite=Strict, Path=/,                   15 min
//   refreshToken — HttpOnly, SameSite=Strict, Path=/api/v1/auth/refresh, 30 d
//
// Both tokens are set and cleared by the server. JavaScript cannot read them
// (HttpOnly flag). The browser sends them automatically on same-origin requests
// because credentials: 'include' is set in all fetch calls.
//
// Session indicator:
//   oa_sess=1 — plain (non-HttpOnly), SameSite=Strict cookie readable by JS.
//   Purpose: client-side UI hint only (guard redirect, nav state).
//   Contains no secret — it cannot be used to authenticate API requests.
//   Set client-side after a successful login response; erased on logout.
//
// CSRF: SameSite=Strict means cross-origin requests never carry these cookies.
// No double-submit cookie token is needed — SameSite=Strict is sufficient, and
// the backend already relies on it exclusively.
//
// XSS model: HttpOnly tokens are invisible to JavaScript. An XSS payload can
// make authenticated API calls on behalf of the victim (same-origin, same tab),
// but cannot exfiltrate the tokens for use from an external origin.
// Combined with a 15-min access token window this limits the damage window
// compared to the old model (7-day localStorage JWT, fully stealable).

const SESSION_INDICATOR = 'oa_sess';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// ─── Internal cookie helpers ──────────────────────────────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; SameSite=Strict; max-age=${maxAgeSeconds}`;
}

function eraseCookie(name: string): void {
  document.cookie = `${name}=; path=/; SameSite=Strict; max-age=0`;
}

// ─── Session state ────────────────────────────────────────────────────────────

// Returns true when the session indicator cookie is present.
// This is a fast, synchronous client-side hint — not a server-side auth check.
// Real enforcement happens on the server: missing HttpOnly cookie → 401.
export function isAuthenticated(): boolean {
  return readCookie(SESSION_INDICATOR) !== null;
}

// Call immediately after a successful login API response.
// Sets the session indicator so route guards and nav can reflect the logged-in state.
export function markAuthenticated(): void {
  // 28-day horizon matches the refresh token lifetime.
  // The access token itself is only 15 min — refresh happens transparently.
  // If the refresh cookie also expires, the next API call returns 401 and
  // the app redirects to /login.
  writeCookie(SESSION_INDICATOR, '1', 28 * 24 * 60 * 60);
}

// Call when the user logs out or when an unrecoverable 401 is received.
export function markUnauthenticated(): void {
  eraseCookie(SESSION_INDICATOR);
}

// ─── Logout ───────────────────────────────────────────────────────────────────

// Calls POST /auth/logout (which clears the HttpOnly cookies server-side),
// then removes the session indicator.
// Callers should redirect to /login after this resolves.
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include', // sends the accessToken cookie to the logout endpoint
    });
  } finally {
    // Always clear the indicator even if the network call fails.
    // HttpOnly cookies expire on their own schedule.
    markUnauthenticated();
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

// Calls POST /auth/refresh. The browser automatically includes the refreshToken
// cookie because its Path matches /api/v1/auth/refresh.
// Returns true on success (new accessToken cookie set), false if expired/invalid.
export async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    markUnauthenticated();
    return false;
  }
  return true;
}

// ─── Deprecated shims ────────────────────────────────────────────────────────
// Token management is now entirely server-side via HttpOnly cookies.
// These stubs prevent compile errors during migration; remove once unused.

/** @deprecated Call markAuthenticated() after a successful login instead. */
export function setToken(_token: string): void {
  markAuthenticated();
}

/** @deprecated Call logout() or markUnauthenticated() instead. */
export function clearToken(): void {
  markUnauthenticated();
}

/** @deprecated Always returns null — access token is HttpOnly, not readable by JS. */
export function getToken(): string | null {
  return null;
}

// Cookies are sent automatically; no Authorization header needed.
// Kept as a zero-value export so existing imports compile without changes.
export function authHeaders(): HeadersInit {
  return {};
}
