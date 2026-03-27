import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import type { Env } from '../../config/env';

// ─── CsrfOriginMiddleware ───────────────────────────────────────────────────────
//
// Defense-in-depth layer against CSRF attacks on cookie-authenticated endpoints.
//
// Primary defense: SameSite=Strict cookies (enforced by the browser).
//   Browsers will not send accessToken/refreshToken cookies on cross-origin requests.
//   See auth.controller.ts for cookie settings.
//
// This middleware is the server-side fallback. It validates the Origin header
// for any state-mutating request that carries the accessToken cookie. It catches:
//   - Browsers with SameSite bugs or no SameSite support (Safari <12.1, IE)
//   - Configuration drift (someone accidentally changes SameSite to Lax/None)
//   - Any future path where cookie settings are accidentally relaxed
//
// Decision table (only state-mutating methods: POST, PUT, PATCH, DELETE):
//
//   Origin header | accessToken cookie | Outcome
//   ──────────────┼────────────────────┼──────────────────────────────────────────
//   absent        | any                | ALLOW — API client or same-site browser
//   matches WEB   | any                | ALLOW — legitimate browser request
//   mismatches    | absent             | ALLOW — Bearer/API key auth; CSRF-safe
//   mismatches    | present            | BLOCK — cross-site forged cookie request
//
// Not broken by:
//   - Public signing flow (/signing/:token) — no cookie
//   - Stripe webhook (/billing/webhook)     — no cookie, raw-body signature auth
//   - Enterprise API key clients            — no cookie (X-Api-Key header)
//   - Bearer token clients                  — no cookie
//   - CORS preflight (OPTIONS)              — safe method, not checked

const STATE_MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfOriginMiddleware implements NestMiddleware {
  private readonly allowedOrigin: string;

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigin = config.get('WEB_BASE_URL', { infer: true });
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    // Safe methods (GET, HEAD, OPTIONS) cannot mutate state — skip.
    if (!STATE_MUTATING_METHODS.has(req.method)) {
      return next();
    }

    const origin = req.headers.origin as string | undefined;

    // No Origin header: pass through.
    // Browsers always set Origin on cross-origin requests. Its absence means either:
    //   (a) Same-origin browser request (Origin omitted for same-site navigations)
    //   (b) API tool (curl, Postman, server-to-server) — never cookie-authenticated
    if (!origin) {
      return next();
    }

    // Origin present and matches the allowed frontend: legitimate browser request.
    if (origin === this.allowedOrigin) {
      return next();
    }

    // Origin is present and mismatches. Only block if the request is cookie-authenticated.
    // Bearer/API-key clients (no cookie) are inherently CSRF-safe: the attacker cannot
    // forge an Authorization header via a cross-site form/fetch without knowing the token.
    //
    // req.cookies is populated by cookieParser() which is registered in bootstrap()
    // before this middleware runs.
    const hasCookie = !!(req.cookies as Record<string, string> | undefined)?.['accessToken'];
    if (!hasCookie) {
      return next();
    }

    // Cross-origin + state-mutating + cookie-authenticated = blocked.
    throw new ForbiddenException('Cross-site request blocked.');
  }
}
