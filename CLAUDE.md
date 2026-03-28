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
