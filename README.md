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
| Monorepo | npm workspaces + Turborepo | 2 |
| Runtime | Node.js | ≥ 20 LTS |

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
| npm | ≥ 10 |
| PostgreSQL | ≥ 16 |
| Redis | ≥ 7 |

---

## Local development

### 1. Install dependencies

```bash
npm install
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

### 3. Set up the database

```bash
npm run db:migrate       # apply all pending migrations
npm run db:studio        # optional: Prisma Studio at http://localhost:5555
```

### 4. Start services

```bash
npm run dev              # all workspaces in watch mode
```

| Service | URL |
|---------|-----|
| API | http://localhost:3001/api/v1 |
| Frontend | http://localhost:3000 |

---

## Commands

### Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services in watch mode (Turborepo) |
| `npm run dev --workspace=apps/api` | API only |
| `npm run dev --workspace=apps/web` | Web only |

### Testing

| Command | Description |
|---------|-------------|
| `npm test` | All Jest tests (unit + integration) |
| `npm test --workspace=apps/api` | API tests only |

Tests use `EMAIL_PROVIDER=dev` automatically. No real Redis or email required —
the rate limiter injected in tests is a no-op mock.

### Type checking and linting

| Command | Description |
|---------|-------------|
| `npm run lint` | ESLint across all workspaces |
| `npx tsc --noEmit --project apps/api/tsconfig.json` | Type-check the API |
| `npx tsc --noEmit --project apps/web/tsconfig.json` | Type-check the web app |

### Database

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | `prisma migrate dev` (interactive) |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:studio` | Open Prisma Studio |

Production migration (no interactive prompts):
```bash
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

### Build

```bash
npm run build            # build all workspaces
```

---

## Deployment

### Docker (API)

```dockerfile
# apps/api/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN npm ci --workspace=apps/api
COPY . .
RUN npm run build --workspace=apps/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/main"]
```

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
> For cross-origin requests (frontend on Vercel, API elsewhere), the API `CORS_ORIGIN`
> must match the Vercel domain exactly, and requests must include `credentials: 'include'`.

### docker-compose (local full-stack)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: offeraccept_dev
      POSTGRES_USER: offeraccept
      POSTGRES_PASSWORD: offeraccept
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  api:
    build: ./apps/api
    env_file: apps/api/.env
    depends_on: [postgres, redis]
    ports: ["3001:3001"]

  web:
    build: ./apps/web
    environment:
      NEXT_PUBLIC_API_URL: http://api:3001/api/v1
    depends_on: [api]
    ports: ["3000:3000"]

volumes:
  pgdata:
```

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
| Security headers | Helmet (CSP, HSTS, referrer policy, etc.) |
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
