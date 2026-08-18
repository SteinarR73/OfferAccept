# OfferAccept

Evidence-based offer acceptance for SMBs. A recipient verifies their email via OTP,
accepts a frozen offer, and receives a tamper-evident certificate that any third party
can independently verify.

---

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| API | NestJS | 11 |
| Frontend | Next.js + React | 15 / 19 |
| ORM | Prisma | 5 |
| Database | PostgreSQL | 16+ |
| Cache / Rate limit | Redis (ioredis) | 7+ |
| CSS | Tailwind CSS | 4 |
| Email | Resend | — |
| Payments | Stripe | — |
| Storage | AWS S3 / local dev | — |
| Monorepo | pnpm workspaces + Turborepo | 2 |
| Runtime | Node.js | ≥ 20 LTS |

**This repo is pnpm-only.** `package.json`'s `preinstall` script (`npx only-allow pnpm`)
rejects `npm install`/`yarn install` outright — there is no `package-lock.json`, only
`pnpm-lock.yaml`. Use `pnpm`, not `npm`, for every command below.

See [docs/architecture.md](docs/architecture.md) for the full domain model and design rationale.

---

## Repository layout

```
offeraccept/
├── apps/
│   ├── api/          NestJS 11 REST API
│   └── web/          Next.js 15 — dashboard + public signing flow
├── packages/
│   ├── database/     Prisma schema, migrations, generated client
│   └── types/        Shared TypeScript API contracts
└── docs/             Architecture and operational docs
```

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 20 LTS |
| pnpm | 10.20.0 (pinned via `packageManager` in `package.json`; `corepack enable` picks it up automatically) |
| PostgreSQL | ≥ 16 |
| Redis | ≥ 7 |

---

## Local development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Minimum changes for local dev:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/offeraccept_dev

# Redis (rate limiter) — use redis://localhost:6379 for a local instance
REDIS_URL=redis://localhost:6379

# Auth — tokens are issued as HttpOnly cookies
JWT_SECRET=local-dev-secret-at-least-32-chars-long
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30

# Cookie settings (set false in dev, must be true in prod)
COOKIE_SECURE=false

# Signing links
SIGNING_LINK_SECRET=local-dev-signing-secret-32-chars!!
WEB_BASE_URL=http://localhost:3000

# Email (dev = console only, no real mail sent)
EMAIL_FROM=dev@localhost
EMAIL_PROVIDER=dev
```

`EMAIL_PROVIDER=dev` stores OTPs in-memory and prints them to the console.
This value is **blocked at startup** in `NODE_ENV=production`.

> **Redis:** The rate limiter requires Redis. Start one locally:
> ```bash
> docker run -d -p 6379:6379 redis:7-alpine
> ```
> Rate limit checks **fail-open** if Redis is unreachable — the API stays up
> but rate limiting is suspended. Monitor `[rate_limit_redis_error]` logs.

> **Windows + a native PostgreSQL install:** if you already have PostgreSQL installed
> as a Windows service, it will already be listening on `5432` and will silently
> intercept connections meant for `docker compose`'s Postgres container — you'll get
> an authentication error that has nothing to do with your actual credentials. Either
> stop the native service, or map the container to a different host port
> (`docker run -p 5433:5432 ...` / override the `ports:` mapping in `docker-compose.yml`)
> and point `DATABASE_URL` at that port instead.

### 3. Set up the database

```bash
pnpm run db:migrate       # apply all pending migrations
pnpm run db:studio        # optional: Prisma Studio at http://localhost:5555
```

`db:migrate` runs `prisma migrate dev`, which replays every migration in
`packages/database/prisma/migrations/` against your database in order. As of
2026-08-19 this history has been verified end-to-end: 34 migrations apply cleanly
against a genuinely empty database (`prisma migrate deploy`), confirmed by diffing
the result against `schema.prisma` for drift. If you ever see a fresh-database
migration fail, that's a regression — see
[docs/database/postgres-migration.md](docs/database/postgres-migration.md) for how
this was verified and what to check.

### 4. Start services

```bash
pnpm run dev              # all workspaces in watch mode
```

| Service | URL |
|---------|-----|
| API | http://localhost:3001/api/v1 |
| Frontend | http://localhost:3000 |

> **CSP note:** the web app enforces a strict, nonce-based `Content-Security-Policy`
> (`apps/web/src/middleware.ts`) on every route — this only works because every page
> renders dynamically (`export const dynamic = 'force-dynamic'` in
> `apps/web/src/app/layout.tsx`). If you add a new top-level layout, or otherwise
> reintroduce static generation for a route, that route's client-side JavaScript will
> silently fail to hydrate (CSP will block Next's own inline scripts — check the
> browser console for `script-src` violations). Don't disable the CSP to "fix" this;
> fix the rendering mode instead.

---

## Commands

### Development

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start all services in watch mode (Turborepo) |
| `pnpm --filter @offeraccept/api run dev` | API only |
| `pnpm --filter @offeraccept/web run dev` | Web only |

### Testing

| Command | Description |
|---------|-------------|
| `pnpm test` | All Jest tests (unit + integration) |
| `pnpm --filter @offeraccept/api test` | API tests only |

Tests use `EMAIL_PROVIDER=dev` automatically. No real Redis or email required —
the rate limiter injected in tests is a no-op mock.

### Type checking and linting

| Command | Description |
|---------|-------------|
| `pnpm run lint` | ESLint across all workspaces |
| `npx tsc --noEmit --project apps/api/tsconfig.json` | Type-check the API |
| `npx tsc --noEmit --project apps/web/tsconfig.json` | Type-check the web app |

### Database

| Command | Description |
|---------|-------------|
| `pnpm run db:migrate` | `prisma migrate dev` (interactive) |
| `pnpm run db:generate` | Regenerate Prisma client after schema changes |
| `pnpm run db:studio` | Open Prisma Studio |

Production migration (no interactive prompts):
```bash
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

### Build

```bash
pnpm run build            # build all workspaces
```

---

## Deployment

### Docker (API)

Build from the **repo root** (both Dockerfiles `COPY` files from sibling
workspace packages, so the build context must be the monorepo root, not
`apps/api/`):

```bash
docker build -f apps/api/Dockerfile -t offeraccept-api .
```

See [apps/api/Dockerfile](apps/api/Dockerfile) for the actual, verified build —
don't hand-roll a copy of it here; it drifts. Two things worth knowing if you
touch it:
- It installs with `pnpm install --frozen-lockfile`, not `npm ci` — this repo
  has no `package-lock.json`, so `npm ci` fails immediately.
- The compiled entry point is `apps/api/dist/apps/api/src/main.js`, **not**
  `apps/api/dist/main.js` — `apps/api/tsconfig.json`'s cross-package `paths`
  (pointing at `packages/database` and `packages/types` source) make `tsc`
  infer a repo-root `rootDir` instead of `src`, so the compiled output mirrors
  the full path from the repo root. `nest-cli.json`'s `entryFile` and the
  Dockerfile's `CMD` are both already set to the correct path — if you ever
  see `Cannot find module '.../dist/main'`, this is why.

Verified: `docker build --no-cache -f apps/api/Dockerfile -t offeraccept-api .`
builds successfully, and the resulting image boots to `Nest application
successfully started` against a live Postgres/Redis (2026-08-19).

Required environment variables in production:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...          # rediss:// for TLS (Upstash, Elasticache)
REDIS_TLS=true                  # or let rediss:// prefix auto-detect
JWT_SECRET=<strong-random-64-chars>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30
COOKIE_SECURE=true              # required in production
COOKIE_DOMAIN=.yourdomain.com   # optional — omit for same-domain only
SIGNING_LINK_SECRET=<strong-random>
WEB_BASE_URL=https://app.yourdomain.com
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=offers@yourdomain.com
STORAGE_PROVIDER=s3
AWS_REGION=eu-west-1
S3_BUCKET_NAME=offeraccept-docs
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

### Vercel (Frontend)

The Next.js app deploys directly to Vercel:

```bash
vercel --prod
```

Set these environment variables in the Vercel project settings:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

> **Cookie note:** The API sets `accessToken` and `refreshToken` as HttpOnly cookies.
> For cross-origin requests (frontend on Vercel, API elsewhere), the API's
> `WEB_BASE_URL` env var must match the Vercel domain exactly (CORS is not
> wildcarded — see `apps/api/src/main.ts`), and requests must include
> `credentials: 'include'`.

Building the web image manually (instead of Vercel) has the same "build from the
repo root" requirement as the API:

```bash
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1 \
  -t offeraccept-web .
```

`NEXT_PUBLIC_API_URL` must be passed as a build arg — it's inlined into the client
JS bundle at build time, not read at runtime. It's also read at server start by
`apps/web/src/middleware.ts` to add the API's origin to the CSP `connect-src`
directive; if you change this value, both places pick it up automatically since
they both read the same env var, but you do need a rebuild for the client bundle.

### docker-compose (local backing services)

[docker-compose.yml](docker-compose.yml) starts Postgres + Redis only by default —
run `apps/api` and `apps/web` on the host with `pnpm run dev` in normal local dev:

```bash
docker compose up -d              # Postgres + Redis only
docker compose --profile full up -d   # + api and web, built from their Dockerfiles
docker compose down -v            # stop and wipe volumes
```

Don't copy the compose file's content into other docs — reference it instead; it
already documents itself and drifts if duplicated.

---

## Authentication model

All sender/dashboard endpoints use **HttpOnly cookie authentication**:

| Cookie | Scope | TTL | Purpose |
|--------|-------|-----|---------|
| `accessToken` | All paths | 15 min | JWT; verified by `JwtAuthGuard` |
| `refreshToken` | `POST /auth/refresh` only | 30 days | Rotated on each use |

The `JwtAuthGuard` accepts either `Authorization: Bearer <token>` or the `accessToken`
cookie — making it compatible with both browser sessions and programmatic API clients.

`POST /auth/login` → sets both cookies.
`POST /auth/refresh` → rotates the refresh token and issues a new access token cookie.
`POST /auth/logout` → clears both cookies.

**No tokens are stored in `localStorage`.** The only client-side indicator is a
non-HttpOnly `oa_sess` indicator cookie (no sensitive data) used for routing decisions.

---

## Security model (summary)

| Control | Implementation |
|---------|---------------|
| Signing tokens | 256-bit entropy; only SHA-256 stored; embedded in email link |
| OTP codes | 6-digit, `crypto.randomInt`; only SHA-256 stored; 10-min TTL; max 5 attempts |
| Acceptance statement | Server-generated from frozen snapshot — client cannot inject content |
| Certificates | Deterministic SHA-256 of canonical JSON; reproducible from stored evidence |
| Tenant isolation | All offer queries require `organizationId` in the WHERE clause |
| Rate limiting | Redis sliding-window (Lua, atomic); distributed; fail-open on Redis outage |
| Auth cookies | HttpOnly, SameSite=Strict, Secure (prod), scoped `Path` |
| Security headers (API) | Helmet (CSP, HSTS, referrer policy, etc.) on `apps/api` responses |
| Security headers (web) | Separate nonce-based CSP on `apps/web` HTML responses — see `apps/web/src/middleware.ts`. Requires every page to render dynamically; see the CSP note under [Local development](#local-development) |
| Multi-org RBAC | `Membership` table; `OWNER > ADMIN > MEMBER > VIEWER` hierarchy |

See [docs/architecture.md](docs/architecture.md) for the full security model.

---

## Test coverage

| Test file | Coverage area |
|-----------|--------------|
| `test/signing/signing-flow.e2e.spec.ts` | Full signing flow: token → OTP → verify → accept |
| `test/signing/acceptance-statement.spec.ts` | Statement text identical for display and storage |
| `test/offers/send-offer-delivery.spec.ts` | Delivery tracking, resend, revoke |
| `test/offers/tenant-isolation.spec.ts` | Org-scoped queries reject cross-tenant access |
| `test/offers/offers-lifecycle.e2e.spec.ts` | Full offer lifecycle end-to-end |
| `test/certificates/certificate-hash.spec.ts` | Hash determinism and reproducibility |
| `test/certificates/certificate-tampering.spec.ts` | Tamper detection across all three checks |
| `test/support/support.spec.ts` | Support tooling auth, case view, timeline, actions |
| `test/logging/logging-redaction.spec.ts` | No OTP/token in logs; production env guards |
| `test/email/email-secrets.spec.ts` | Email adapter does not log sensitive material |
| `test/enterprise/api-key-guard.spec.ts` | API key lookup, revocation, expiry |
| `test/enterprise/org-role-guard.spec.ts` | RBAC role hierarchy enforcement |

---

## Key documentation

| Document | Contents |
|----------|----------|
| [docs/architecture.md](docs/architecture.md) | Domain model, request flows, trust boundaries, Mermaid diagrams |
| [docs/certificates.md](docs/certificates.md) | Certificate verification model, third-party verification |
| [docs/delivery.md](docs/delivery.md) | Offer delivery state, resend semantics |
| [docs/support.md](docs/support.md) | Internal support API, dispute workflows |
| [docs/email.md](docs/email.md) | Email provider configuration (dev / Resend) |
| [docs/operations.md](docs/operations.md) | Production setup, backup, incident response |
| [docs/launch-gates.md](docs/launch-gates.md) | Pre-launch checklist (Gate 1–6) |
