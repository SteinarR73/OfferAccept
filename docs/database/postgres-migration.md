# PostgreSQL Migration Runbook

This document covers everything needed to run OfferAccept against PostgreSQL:
local development setup, staging migration, production rollout, and rollback.

The Prisma schema (`packages/database/prisma/schema.prisma`) has always targeted
PostgreSQL — it uses `provider = "postgresql"`, PostgreSQL-native types
(`@db.Text`, `@db.VarChar`, `String[]` arrays, `Json?`), and native enums.
No SQLite-to-PostgreSQL data migration is required for this project.

---

## 1. Local development

### Prerequisites

- Docker Desktop (or any Docker Engine with Compose v2)
- Node.js ≥ 20, npm ≥ 10

### Start the database

```bash
# From the repo root
docker compose up -d postgres

# Verify it's healthy (should print "offeraccept")
docker compose exec postgres psql -U offeraccept -c '\l'
```

The container exposes PostgreSQL on `localhost:5432` using:
- **Database:** `offeraccept`
- **User:** `offeraccept`
- **Password:** `offeraccept`

### Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

The default `DATABASE_URL` in the example already points at the Docker container:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/offeraccept
```

Update to match the Docker credentials:

```
DATABASE_URL=postgresql://offeraccept:offeraccept@localhost:5432/offeraccept
```

### Run migrations

```bash
cd packages/database
npx prisma migrate dev
```

This applies all migrations in `prisma/migrations/` and regenerates the Prisma client.

### Verify

```bash
npx prisma db seed        # if a seed script is configured
npx prisma studio         # optional: open GUI at http://localhost:5555
```

---

## 2. Staging migration

Staging should mirror production as closely as possible. Use a managed PostgreSQL
provider (see §4) with a `DATABASE_URL` scoped to the staging database.

### Steps

```bash
# 1. Set DATABASE_URL to the staging database
export DATABASE_URL="postgresql://user:pass@staging-host:5432/offeraccept_staging"

# 2. Apply pending migrations (non-interactive, safe for CI/CD)
cd packages/database
npx prisma migrate deploy

# 3. Verify migration status — should show all applied
npx prisma migrate status

# 4. Generate the Prisma client (if running on a fresh machine)
npx prisma generate
```

`migrate deploy` (not `migrate dev`) is the correct command for non-local environments:
it applies migrations without prompting and never creates new migration files.

### Smoke test

After migration, run a connectivity and schema check:

```bash
npx prisma db execute --stdin <<'SQL'
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
SQL
```

Expected: all tables defined in the schema are listed.

---

## 3. Production rollout

### Pre-deployment checklist

- [ ] `DATABASE_URL` is set in the deployment environment (not in any committed file)
- [ ] The secret is stored in a secrets manager (AWS Secrets Manager, Doppler, etc.)
- [ ] Connection pooling is configured (see §4)
- [ ] `npx prisma migrate status` on a maintenance connection shows 0 pending migrations
- [ ] A database backup has been taken (or confirmed by the provider's auto-backup)
- [ ] The migration has been run and verified on staging first

### Deployment sequence

```
1. Take a manual database snapshot / backup
2. Run: npx prisma migrate deploy   ← schema changes before new code
3. Deploy the new API build
4. Monitor logs for Prisma or query errors
5. Run smoke tests against the live API
```

Always run `migrate deploy` **before** deploying the application code. Prisma
migrations are designed to be forward-compatible: new nullable columns and
added indexes do not break the running old binary.

### Connection string format

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public&connection_limit=10&pool_timeout=20
```

For managed providers with pgBouncer / transaction pooling:

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?pgbouncer=true&connection_limit=10
```

---

## 4. Recommended providers

All three providers offer PostgreSQL 16, connection pooling, and point-in-time recovery.

| Provider | Notes |
|---|---|
| **Neon** | Serverless, scales to zero, branch-per-PR workflow, free tier |
| **Supabase** | Managed Postgres + optional extras (Auth, Storage) — use DB only |
| **Railway** | Straightforward pricing, good DX, built-in metrics |

For all providers:
- Enable **connection pooling** (pgBouncer in transaction mode) — NestJS + pg-boss
  holds idle connections; pooling prevents exhaustion under load.
- Enable **automated daily backups** and set a retention period ≥ 7 days.
- Restrict inbound connections to the API's egress IP range (or VPC peering).

---

## 5. Rollback plan

### Scenario A — migration deployed, application not yet deployed

```bash
# The migration introduced a backwards-incompatible change and must be reverted.
# Prisma does not support automatic rollback; apply the inverse manually.

# 1. Write a down-migration SQL (reverse of the latest migration file)
# 2. Apply it directly
psql "$DATABASE_URL" -f migrations/rollback/YYYYMMDD_description_down.sql

# 3. Mark the migration as rolled back in Prisma's migration history table
psql "$DATABASE_URL" -c \
  "DELETE FROM _prisma_migrations WHERE migration_name = 'YYYYMMDD_description';"
```

### Scenario B — application deployed, data corruption detected

```bash
# 1. Revert the API deployment to the previous Docker image / build
# 2. Restore from the pre-deployment database snapshot
#    (process depends on provider — use their point-in-time restore UI/CLI)
# 3. Re-run smoke tests against the restored database
# 4. Investigate root cause before re-attempting the migration
```

### Rollback-safe migration practices

- **Additive changes** (new nullable columns, new indexes, new tables) are safe to
  deploy without a corresponding rollback plan — the old code ignores unknown columns.
- **Breaking changes** (dropping columns, renaming columns, changing column types)
  require a multi-step deploy: add the new shape → migrate data → remove the old shape.
- **Never drop a column or rename one** in the same migration that adds the replacement.

### Adding indexes to tables with live traffic

`CREATE INDEX` acquires a `ShareLock` that blocks all writes until the index is
built. On an empty table (initial migrations) this is instantaneous. On a table
with millions of rows it can block writes for seconds to minutes.

For live-traffic tables, use `CREATE INDEX CONCURRENTLY` which builds the index
without blocking writes. **Important:** `CONCURRENTLY` cannot run inside a
transaction block. Because Prisma wraps every migration SQL in `BEGIN/COMMIT`,
you cannot use it inside a standard migration file.

**Procedure for live-traffic indexes:**

```bash
# 1. Create the index manually (runs concurrently — no write lock)
psql "$DATABASE_URL" -c 'CREATE INDEX CONCURRENTLY "my_index" ON "my_table"("column");'

# 2. Mark the migration as applied so Prisma does not try to re-run it
npx prisma migrate resolve --applied 20YYMMDD_my_index_migration \
  --schema packages/database/prisma/schema.prisma
```

The migration SQL file still documents the `CREATE INDEX` form (without CONCURRENTLY)
so the schema and Prisma's migration history stay in sync. The actual SQL applied
manually contains `CONCURRENTLY`.

---

## 6. Known schema notes

### ID generation strategy

Most models use `cuid()` for primary keys. `AcceptanceCertificate.id` is the sole
exception — it uses `uuid()`. This inconsistency is intentional (certificate IDs are
externally visible in verification URLs where UUID format is conventional).

The `AcceptanceCertificate.id` column is currently stored as PostgreSQL `text` rather
than the native `uuid` type because the `@db.Uuid` annotation was never added to the
schema. Changing this requires an `ALTER COLUMN TYPE` migration. Risk: low for a
pre-production project, higher once certificates have been issued to customers. Defer
this change to a scheduled maintenance window.

When the time comes, the migration is:

```sql
ALTER TABLE "acceptance_certificates"
  ALTER COLUMN "id" TYPE uuid USING "id"::uuid;
```

### Email case sensitivity

PostgreSQL's `text` type is case-sensitive. `User.email`, `Invite.email`, and
`AcceptanceRecord.verifiedEmail` are all `text` columns with unique constraints or
query patterns that must be case-insensitive to be correct.

**Current enforcement:** Both repository layers (`auth.repository.ts` and
`org.repository.ts`) normalize email addresses to `.toLowerCase().trim()` at the
DB boundary before every read and write. This is the canonical enforcement point —
the comment in each file explains the requirement. Never query or insert an email
without normalization in these files.

**Future option — `citext`:** PostgreSQL's `citext` extension stores text in its
original form but performs all comparisons case-insensitively, eliminating the need
for application-layer normalization entirely. Migration path:

```sql
-- 1. Enable the extension (requires superuser or pg_extension privilege)
CREATE EXTENSION IF NOT EXISTS citext;

-- 2. Change the column types
ALTER TABLE "users"   ALTER COLUMN "email" TYPE citext;
ALTER TABLE "invites" ALTER COLUMN "email" TYPE citext;

-- 3. The unique index on users.email is automatically case-insensitive after the type change.
--    No index rebuild is needed.
```

Risk: `citext` is a PostgreSQL extension not available on all managed providers
(Neon supports it; some PlanetScale-style abstractions do not). It also changes
how Prisma reports the column type in introspection. Prefer the current approach
(application normalization) until a concrete need to remove normalization arises.

### Invite deduplication

The `invites` table currently has no `UNIQUE` constraint on `(organizationId, email)`.
Application code calls `revokePendingInvites` before each insert, but this is not
atomic — two concurrent requests can both pass the check and both insert, leaving
duplicate active invites for the same org + email pair.

**Recommended future constraint:**

```sql
-- Option A: full unique (simple, enforces one active+historical invite per pair)
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_email_unique"
  UNIQUE ("organizationId", email);

-- Option B: partial unique index (allows historical rows; only one active invite)
CREATE UNIQUE INDEX "invites_org_email_active_idx"
  ON "invites"("organizationId", email)
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
```

Option B is recommended: it preserves invite history while preventing duplicates
for active invites. The corresponding `revokePendingInvites` call becomes the
"upsert" mechanism — revoke old, then insert new.

The Prisma schema comment on `Invite` documents this constraint as pending.

---

## 7. pg-boss configuration


OfferAccept uses [pg-boss](https://github.com/timgit/pg-boss) for background jobs.
pg-boss creates its own schema (`pgboss`) inside the same database. No extra
configuration is required — the `JobModule` initialises pg-boss on startup using
the same `DATABASE_URL`.

If using pgBouncer in **transaction mode**, add `?pgbouncer=true` to the connection
string **and** set `max_connections` in pg-boss to a value well below the pgBouncer
pool size (recommended: `max_connections = pool_size * 0.5`).

---

## 8. Query performance notes

### Covered queries (no action needed)

| Query | Location | Index used |
|---|---|---|
| `offers` list/cursor: `WHERE organizationId ORDER BY createdAt DESC, id DESC` | `offers.service.ts` | `offers_org_created_id_idx` ✅ |
| `offers` expiry sweep: `WHERE status = SENT AND expiresAt < NOW()` | `expire-offers.handler.ts` | `offers_status_expiresat_idx` ✅ |
| `dealEvents` for a deal: `WHERE dealId ORDER BY createdAt ASC` | `deal-events.service.ts` | `deal_events_dealId_idx` ✅ |
| `signingEvents` for a session: `WHERE sessionId ORDER BY sequenceNumber` | `signing-event.service.ts` | `signing_events_sessionId_seqnum_uniq` ✅ |

### Queries that may benefit from future indexes

These queries are correct and functional today. At scale they may benefit from
more specific indexes. Do NOT add them pre-emptively — measure first.

**`DealEvent.getRecentForOrg` — activity feed**

```typescript
// deal-events.service.ts
this.db.dealEvent.findMany({
  where: { offer: { organizationId: orgId, deletedAt: null } },
  orderBy: { createdAt: 'desc' },
  take: 20,
})
```

This joins through `offers` to filter by `organizationId`. PostgreSQL must
evaluate the join predicate for every row considered by the `createdAt DESC` index.
At high volume, denormalizing `organizationId` onto `deal_events` and adding
`@@index([organizationId, createdAt(sort: Desc)])` would allow a single-table scan.
This is an architectural change — defer until query latency is measurable.

**`DealEvent.getForDeal` — deal timeline**

```typescript
// deal-events.service.ts
this.db.dealEvent.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } })
```

`@@index([dealId])` covers the filter. PostgreSQL applies a separate sort step after.
A composite `@@index([dealId, createdAt])` would serve both filter and sort from a
single index scan. This matters only when a single deal accumulates many events
(>100); typical deals produce 5–15 events.

**`OfferRecipient` search by email — support tool**

```typescript
// support.service.ts
this.db.offerRecipient.findMany({ where: { email: query.recipientEmail } })
```

`OfferRecipient.email` has no index. This is an internal support search, not a
customer-facing endpoint — sequential scans are acceptable today. If the support
tool becomes latency-sensitive, add `@@index([email])` to `OfferRecipient`.

**`Offer` list by user — account dashboard**

```typescript
// account.service.ts
this.db.offer.findMany({
  where: { createdById: userId, organizationId: orgId, deletedAt: null },
  orderBy: { createdAt: 'desc' },
})
```

`@@index([createdById])` exists but does not include `organizationId` or `createdAt`.
PostgreSQL uses it for filtering then sorts the result. For users with many offers,
a composite `@@index([createdById, organizationId, createdAt(sort: Desc)])` would
handle filter + sort in one index scan.

---

## 9. Useful commands reference

```bash
# Apply all pending migrations (CI / production)
npx prisma migrate deploy

# Create a new migration from schema changes (local dev only)
npx prisma migrate dev --name describe_the_change

# Check migration status
npx prisma migrate status

# Regenerate Prisma client after schema change
npx prisma generate

# Open Prisma Studio (local GUI)
npx prisma studio

# Reset local database (drops all data — local dev only)
npx prisma migrate reset

# Run a raw SQL file against the database
psql "$DATABASE_URL" -f path/to/file.sql

# Connect interactively (local Docker)
docker compose exec postgres psql -U offeraccept
```
