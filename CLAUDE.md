# OfferAccept — AI Development Guidelines

Rules for AI tools (Claude Code, Cursor, Copilot, etc.) working in this repository.

---

## Current architecture

The system is a monorepo. Do not deviate from these layers without an explicit instruction to do so.

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 |
| Backend | NestJS 11 · TypeScript |
| Database | PostgreSQL 16 via Prisma ORM |
| Job queue | pg-boss (Postgres-native) |
| Cache / rate-limit | Redis |
| Auth | JWT in HttpOnly cookies |
| Storage | S3-compatible object storage |
| Email | Resend |
| Payments | Stripe |
| Deployments | Monorepo — `apps/web`, `apps/api`, `packages/database` |

---

## Rules

### Do not introduce new infrastructure layers

AI tools must not add infrastructure that does not already exist in the system.

**Forbidden without an explicit instruction:**

- Message queues (RabbitMQ, Kafka, SQS, BullMQ, etc.) — the job queue is pg-boss
- Microservices or service-to-service HTTP — the backend is a single NestJS application
- New ORMs or query builders — the ORM is Prisma; do not add Drizzle, TypeORM, Knex, or raw-SQL abstractions
- New backend frameworks — the API framework is NestJS; do not add Express apps, Fastify, Hono, tRPC servers, etc.
- New frontend frameworks — the frontend framework is Next.js; do not add Remix, Vite standalone apps, etc.
- New caches or stores — Redis is already present; do not add Memcached, additional Redis instances, or in-process caches with external dependencies
- Container orchestration configuration (Kubernetes, Docker Compose services) that adds new runtime dependencies

If a task seems to require one of the above, stop and ask. Do not work around the constraint by introducing a "lightweight" or "temporary" version of the forbidden layer.

### Stay inside the existing dependency set

Before adding a new npm package, check whether the existing stack already solves the problem:
- Background jobs → pg-boss (`JobService`)
- Scheduling → pg-boss cron
- Validation → class-validator / Zod (already present)
- HTTP client → native `fetch`
- Hashing / crypto → Node.js built-in `crypto`

Add a dependency only when the existing stack genuinely cannot cover the need.

### Preserve immutable-table integrity

`AcceptanceRecord`, `OfferSnapshot`, `OfferSnapshotDocument`, and `SigningEvent` are append-only. Do not add `UPDATE` or `DELETE` operations against these tables.

### Schema changes require migrations

Every Prisma schema change must be accompanied by a migration file in `packages/database/prisma/migrations/`. Do not edit the schema without also providing the migration SQL.

**Verify new migrations against a fresh database, not just a schema review.** On
2026-08-19, this history was found to have gone since inception without ever being
replayed end-to-end from empty — no migration created `users` or most of the core
schema, and five further migrations had their own independent, fresh-install-only
bugs (redundant enum values, a missing `CREATE EXTENSION`, two ordering bugs
between same-day migrations, a partial unique index incompatible with the
application's own `upsert()` call). None of this was visible from reading the
migration files or the schema in isolation — only from actually running
`prisma migrate deploy` against an empty, disposable Postgres container. Do this
for any new migration that isn't a trivial, obviously-additive change. Full
writeup: `docs/database/postgres-migration.md` §10.

### This repo is pnpm-only

`package.json`'s `preinstall` script (`npx only-allow pnpm`) rejects `npm install`/`yarn install`. There is no `package-lock.json`, only `pnpm-lock.yaml`. Both Dockerfiles were broken for a long time because they ran `npm ci` — if you touch either Dockerfile, or write install instructions anywhere, use `pnpm install --frozen-lockfile`, and actually run `docker build` to confirm before calling it done (see next rule).

### The CSP requires every page to render dynamically

`apps/web/src/middleware.ts` sets a strict, nonce-based CSP; `apps/web/src/app/layout.tsx` sets `export const dynamic = 'force-dynamic'` to make that possible. A nonce only exists once a request exists — a statically-generated page is built once with no nonce available, so its baked-in HTML can never match a fresh per-request CSP nonce, and React silently fails to hydrate (the page renders but nothing is clickable). This is not obvious from reading either file in isolation; it only showed up by actually loading a page in a browser and reading the console. If you ever reintroduce static generation for a route (removing `force-dynamic`, adding a per-page `export const dynamic = 'force-static'`, etc.), that route will silently break — verify in a real browser, not just a successful build.

### Verify by actually running things, not by reading code

`docs/ops/launch-readiness-report.md` declared this app launch-ready in April 2026 on the strength of "DONE | evidence: file exists" checklist entries. In August, actually building the Docker images, actually booting the API against a live database, and actually loading the web app in a browser surfaced multiple fully-blocking bugs that checklist missed entirely — the API couldn't build, couldn't boot, couldn't reach a fresh database, couldn't run a single background job, and the frontend couldn't hydrate at all. None of these were visible from code review. Before reporting a fix, a migration, a Dockerfile change, or a security control as working: run it against something real (a live database, an actual `docker build`, a real browser), not just against the mocked test suite or a reading of the diff.
