import { ForbiddenException } from '@nestjs/common';
import { CsrfOriginMiddleware } from '../../src/common/middleware/csrf-origin.middleware';

// ─── CsrfOriginMiddleware tests ────────────────────────────────────────────────
//
// Server-side CSRF defense-in-depth: validates the Origin header on cookie-
// authenticated state-mutating requests. The primary defence is SameSite=Strict
// (browser-enforced); this middleware catches what the browser misses.
//
// Decision table (under test):
//
//   Method | Origin header | Cookie present | Expected
//   ───────┼───────────────┼────────────────┼─────────────────────────────
//   POST   | mismatch      | yes            | ForbiddenException (BLOCKED)
//   POST   | matches       | yes            | next() called (ALLOWED)
//   POST   | mismatch      | no             | next() called (ALLOWED — Bearer/API)
//   POST   | absent        | yes            | next() called (ALLOWED — same-site/API)
//   GET    | mismatch      | yes            | next() called (ALLOWED — safe method)
//   OPTIONS| mismatch      | yes            | next() called (ALLOWED — preflight)
//   DELETE | mismatch      | yes            | ForbiddenException (BLOCKED)
//   PATCH  | mismatch      | yes            | ForbiddenException (BLOCKED)
//   PUT    | mismatch      | yes            | ForbiddenException (BLOCKED)

const ALLOWED_ORIGIN = 'https://app.offeracept.com';
const EVIL_ORIGIN = 'https://evil.example.com';

function buildMiddleware(allowedOrigin = ALLOWED_ORIGIN) {
  const configMock = {
    get: (_key: string) => allowedOrigin,
  };
  return new CsrfOriginMiddleware(configMock as never);
}

function makeReq(opts: {
  method?: string;
  origin?: string;
  cookies?: Record<string, string>;
}) {
  return {
    method: opts.method ?? 'POST',
    headers: opts.origin !== undefined ? { origin: opts.origin } : {},
    cookies: opts.cookies ?? {},
  };
}

function makeNext() {
  let called = false;
  const fn = () => { called = true; };
  return { fn, wasCalled: () => called };
}

// ─── Blocked: cross-origin + cookie ────────────────────────────────────────────

describe('CsrfOriginMiddleware — BLOCKED cases', () => {
  it('blocks POST with mismatched Origin and accessToken cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'POST', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });

    expect(() => mw.use(req as never, {} as never, () => {})).toThrow(ForbiddenException);
  });

  it('blocks PUT with mismatched Origin and accessToken cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'PUT', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });

    expect(() => mw.use(req as never, {} as never, () => {})).toThrow(ForbiddenException);
  });

  it('blocks PATCH with mismatched Origin and accessToken cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'PATCH', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });

    expect(() => mw.use(req as never, {} as never, () => {})).toThrow(ForbiddenException);
  });

  it('blocks DELETE with mismatched Origin and accessToken cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'DELETE', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });

    expect(() => mw.use(req as never, {} as never, () => {})).toThrow(ForbiddenException);
  });

  it('ForbiddenException message is generic (does not leak internal state)', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'POST', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });

    try {
      mw.use(req as never, {} as never, () => {});
      fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const msg = (e as ForbiddenException).message;
      // Must not reveal the allowed origin or internal routing details
      expect(msg).not.toContain(ALLOWED_ORIGIN);
      expect(msg).not.toContain('accessToken');
    }
  });
});

// ─── Allowed: legitimate same-origin browser request ──────────────────────────

describe('CsrfOriginMiddleware — ALLOWED: correct origin', () => {
  it('allows POST with matching Origin and accessToken cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'POST', origin: ALLOWED_ORIGIN, cookies: { accessToken: 'jwt.token' } });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });
});

// ─── Allowed: no Origin header (API client / same-site browser) ───────────────

describe('CsrfOriginMiddleware — ALLOWED: no Origin header', () => {
  it('allows POST with no Origin header even when cookie is present', () => {
    const mw = buildMiddleware();
    // No 'origin' key in headers — simulates API client or same-site browser
    const req = makeReq({ method: 'POST', cookies: { accessToken: 'jwt.token' } });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });

  it('allows DELETE with no Origin header even when cookie is present', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'DELETE', cookies: { accessToken: 'jwt.token' } });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });
});

// ─── Allowed: no cookie (Bearer / API key / public endpoint) ──────────────────

describe('CsrfOriginMiddleware — ALLOWED: no cookie (non-cookie auth)', () => {
  it('allows POST with mismatched Origin when no accessToken cookie is present', () => {
    const mw = buildMiddleware();
    // Simulates a Bearer token or X-Api-Key authenticated request — no cookie
    const req = makeReq({ method: 'POST', origin: EVIL_ORIGIN, cookies: {} });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });

  it('allows POST with mismatched Origin on public signing flow (no cookies at all)', () => {
    const mw = buildMiddleware();
    // Signing flow never sets or reads the accessToken cookie
    const req = makeReq({ method: 'POST', origin: EVIL_ORIGIN });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });
});

// ─── Allowed: safe HTTP methods ────────────────────────────────────────────────

describe('CsrfOriginMiddleware — ALLOWED: safe methods', () => {
  it('allows GET even with mismatched Origin and cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'GET', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });

  it('allows OPTIONS (CORS preflight) even with mismatched Origin and cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'OPTIONS', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });

  it('allows HEAD even with mismatched Origin and cookie', () => {
    const mw = buildMiddleware();
    const req = makeReq({ method: 'HEAD', origin: EVIL_ORIGIN, cookies: { accessToken: 'jwt.token' } });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });
});

// ─── Allowed: other cookies present (but not accessToken) ─────────────────────

describe('CsrfOriginMiddleware — ALLOWED: other cookies but no accessToken', () => {
  it('allows POST when only unrelated cookies are present', () => {
    const mw = buildMiddleware();
    // oa_sess is the client-side UI indicator — contains no secret
    const req = makeReq({ method: 'POST', origin: EVIL_ORIGIN, cookies: { oa_sess: '1' } });
    const next = makeNext();

    mw.use(req as never, {} as never, next.fn);

    expect(next.wasCalled()).toBe(true);
  });
});
