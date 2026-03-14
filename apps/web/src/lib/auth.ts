// ─── Auth utilities (client-side) ─────────────────────────────────────────────
// Minimal JWT storage for the sender dashboard.
// Token is stored in localStorage under OA_TOKEN_KEY.
//
// No refresh token in v1 — token expires per JWT_EXPIRY (default 7d).
// A future task will add proper session management.

const OA_TOKEN_KEY = 'oa_auth_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(OA_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(OA_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(OA_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

// Returns headers with Authorization bearer token, or empty if not authenticated.
export function authHeaders(): HeadersInit {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
