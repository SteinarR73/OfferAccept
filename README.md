# OfferAccept

Evidence-based offer acceptance for small business. Recipients verify their email
via OTP, accept an offer, and receive a tamper-evident certificate that can be
independently verified by any third party.

---

## Architecture

```
apps/
  api/              NestJS 10 REST API (Node 20)
packages/
  database/         Prisma schema, migrations, generated client
docs/               Architecture and operational documentation
```

See [docs/architecture.md](docs/architecture.md) for the full domain model.

---

## Prerequisites

- Node.js 20 LTS
- npm 10+
- PostgreSQL 15+

---

## Local development setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`. Minimum changes for local dev:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/offeracept_dev
JWT_SECRET=local-dev-secret-at-least-32-chars-long
SIGNING_LINK_SECRET=local-dev-signing-secret-32-chars!!
WEB_BASE_URL=http://localhost:3000
EMAIL_FROM=dev@localhost
EMAIL_PROVIDER=dev
```

`EMAIL_PROVIDER=dev` uses the in-memory `DevEmailAdapter`. OTP codes and signing
URLs are printed to the console — no real email is sent. This setting is blocked
at startup when `NODE_ENV=production`.

### 3. Set up the database

```bash
# Apply all migrations
npm run db:migrate

# Optional: open Prisma Studio to inspect data
npm run db:studio
```

### 4. Start the API

```bash
npm run dev
```

The API starts at `http://localhost:3001/api/v1`.

---

## Commands

### Development

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start all services in watch mode |
| `npm run dev --workspace=apps/api` | Start only the API in watch mode |

### Testing

| Command | What it does |
|---------|-------------|
| `npm run test` | Run all unit tests (Jest) |
| `npm run test --workspace=apps/api` | Run API unit tests only |
| `npm run test:e2e --workspace=apps/api` | Run API end-to-end tests |

Tests use `EMAIL_PROVIDER=dev` automatically. No database connection is required
for unit tests — they use mocked Prisma clients.

### Type checking and linting

| Command | What it does |
|---------|-------------|
| `npm run lint` | ESLint across all workspaces |
| `npx tsc --noEmit --project apps/api/tsconfig.json` | Type-check the API |

### Database

| Command | What it does |
|---------|-------------|
| `npm run db:migrate` | Apply pending migrations (`prisma migrate dev`) |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:studio` | Open Prisma Studio at `http://localhost:5555` |

For production migrations (no interactive prompts):
```bash
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

### Build

```bash
npm run build
```

---

## Key documentation

| Document | Contents |
|----------|----------|
| [docs/architecture.md](docs/architecture.md) | Domain model, data flow, trust boundaries |
| [docs/certificates.md](docs/certificates.md) | Certificate verification model, third-party verification |
| [docs/delivery.md](docs/delivery.md) | Offer delivery state, resend semantics |
| [docs/support.md](docs/support.md) | Internal support API, dispute workflows |
| [docs/email.md](docs/email.md) | Email provider configuration |
| [docs/launch-gates.md](docs/launch-gates.md) | Pre-launch checklist (Gate 1–6) |
| [docs/operations.md](docs/operations.md) | Production setup, backup, incident response |

---

## Test coverage areas

| Test file | What it covers |
|-----------|---------------|
| `test/signing/signing-flow.e2e.spec.ts` | Full signing flow: token → OTP → verify → accept |
| `test/signing/acceptance-statement.spec.ts` | Statement text is identical for display and storage |
| `test/offers/send-offer-delivery.spec.ts` | Delivery tracking, resend, revoke |
| `test/offers/tenant-isolation.spec.ts` | Org-scoped queries reject cross-tenant access |
| `test/certificates/certificate-hash.spec.ts` | Hash determinism, reproducibility |
| `test/certificates/certificate-tampering.spec.ts` | Tamper detection across all three checks |
| `test/support/support.spec.ts` | Support tooling auth, case view, timeline, actions |
| `test/logging/logging-redaction.spec.ts` | No OTP/token in logs; production env guards |
| `test/email/email-secrets.spec.ts` | Email adapter does not log sensitive material |

---

## Security model (summary)

- **Signing tokens**: 256-bit entropy, only SHA-256 stored, embedded in email link
- **OTP codes**: 6-digit, `crypto.randomInt`, only SHA-256 stored, 10-min TTL, max 5 attempts
- **Acceptance statement**: server-generated from frozen snapshot data — client cannot inject content
- **Certificates**: deterministic SHA-256 of canonical JSON payload; reproducible from stored evidence
- **Tenant isolation**: all offer queries require `organizationId` in the WHERE clause
- **Rate limiting**: sliding window per IP and per token (in-process, single deployment)
- **Auth guards**: JWT required for all sender routes; `INTERNAL_SUPPORT` role for support routes

For the full security model, see [docs/architecture.md](docs/architecture.md).

---

## Known limitations (v1)

See [docs/operations.md](docs/operations.md) for the complete list. Quick summary:

- Rate limiting is single-process (in-memory). Not suitable for multi-process deployments.
- No background job for expiring `SENT` offers past their `expiresAt`.
- Certificate is evidenced acceptance, not a Qualified Electronic Signature (QES).
- Document files are not served by the API; pre-signed URLs must be generated by the frontend.
