# PostgreSQL Migration Runbook

This document covers everything needed to run OfferAccept against PostgreSQL:
local development setup, staging migration, production rollout, and rollback.

The Prisma schema (`packages/database/prisma/schema.prisma`) has always targeted
PostgreSQL — it uses `provider = "postgresql"`, PostgreSQL-native types
(`@db.Text`, `@db.VarChar`, `String[]` arrays, `Json?`), and native enums.
No SQLite-to-PostgreSQL data migration is required for this project.

> **Status (2026-08-19): migration history now verified to bootstrap a fresh
> database.** Until this date, `prisma migrate deploy` against a genuinely empty
> database could never succeed — no migration in the history ever created the
> `users` table or most of the core schema (history started mid-structure at
> `20260320_create_organizations`, plus several independent bugs in later
> migrations). Every environment that ever worked was bootstrapped some other
> way (most likely `prisma db push`) and never actually replayed the full
> migration list from scratch. Two new migrations
> (`20260320b_baseline_core_schema`, `20260321b_baseline_memberships_invites`)
> reconstruct the missing baseline, and several existing migrations were fixed
> in place. Full details: [§10 Migration history integrity](#10-migration-history-integrity)
> at the bottom of this document. If you're setting up a new environment for the
> first time, `prisma migrate deploy` should now just work — if it doesn't,
> that's a regression worth flagging.

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

---

## 10. Migration history integrity

This section documents what was actually broken and fixed on 2026-08-19, and how
it was verified — kept here rather than folded silently into the migration files
themselves, since the *process* used to find and confirm these bugs is reusable
the next time migration history drifts from reality.

### What was broken

**No baseline.** `packages/database/prisma/migrations/` starts at
`20260320_create_organizations`, which creates exactly one table
(`organizations`). Every later migration assumes `users`, `offers`, and ~18
other core tables already exist — but nothing in the committed history ever
creates them. Confirmed by running `prisma migrate deploy` against a genuinely
empty Postgres database: it fails on the fourth migration
(`20260322_multiorg_viewer_role`, which does `ALTER TABLE "users" ...`) with
`relation "users" does not exist`.

**Plus five independent bugs**, each surfaced only by actually replaying the
full history against a fresh database (none of these would show up from
reading the schema or running the existing test suite, since tests mock
Prisma and never execute real migration SQL):

1. `20260322_multiorg_viewer_role` — `ALTER TYPE "OrgRole" ADD VALUE 'VIEWER'`
   was always redundant; `20260321_create_orgrole_enum`'s `CREATE TYPE`
   already includes `'VIEWER'`. Guaranteed `42710` error on replay.
2. `20260408_backfill_memberships_from_user_org` — uses `gen_random_bytes()`
   without any migration ever running `CREATE EXTENSION pgcrypto`.
3. `20260411_ai_audit_event` sorts alphabetically *before*
   `20260411_audit_event_structured` (needs the `AuditEventType` enum that
   migration creates) and `20260411_audit_events` (needs the table that
   migration creates) — both migrations ran too early relative to what they
   depend on.
4. Same class of bug: `20260411_audit_event_structured` alters the
   `user_packages.packageType` column, but `20260411_user_packages` (which
   creates that table) also sorted after it alphabetically.
5. `20260411_jobs` — `jobs.pgBossId`'s unique index was declared **partial**
   (`WHERE "pgBossId" IS NOT NULL`) to allow multiple `NULL` values. This was
   unnecessary (a plain unique index already permits unlimited `NULL`s in
   Postgres) and actively broken: `JobTrackingService.claimJob()`'s
   `db.job.upsert({ where: { pgBossId } })` generates an `ON CONFLICT
   (pgBossId)` clause, and Postgres cannot target a partial index with a bare
   `ON CONFLICT` — every job claim failed with `42P10 "there is no unique or
   exclusion constraint matching the ON CONFLICT specification"`. This one
   isn't just a fresh-install problem — it means **no pg-boss job could ever
   successfully execute**, on any database built from this migration.

### What was fixed

- Added `20260320b_baseline_core_schema` and
  `20260321b_baseline_memberships_invites` (the split exists because
  `memberships`/`invites` need the `OrgRole` enum, which only exists after
  `20260321_create_orgrole_enum` runs). Content derived from
  `prisma migrate diff --from-empty --to-schema-datamodel schema.prisma`,
  with every column/index/constraint a *later* existing migration adds
  deliberately excluded, so that migration still applies cleanly on top.
- `20260322`: `ADD VALUE` → `ADD VALUE IF NOT EXISTS` (idempotent either way).
- `20260408`: added `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` before the
  `gen_random_bytes()` call.
- Renamed four `20260411_*` migration folders with `a_`/`aa_`/`b_`/`c_`
  prefixes so their alphabetical (= applied) order matches their real
  dependencies: `20260411_a_audit_events` → `20260411_aa_user_packages` →
  `20260411_b_audit_event_structured` → `20260411_c_ai_audit_event`.
- `20260411_jobs`: partial unique index → plain unique index on `pgBossId`.

Editing already-shipped migration files is normally something to avoid — but
every fix here is either idempotent (`IF NOT EXISTS` guards, so an
already-applied environment sees no difference since `migrate deploy` never
re-runs a migration it has already recorded) or a pure rename (folder name
only; Prisma's applied-state tracking is keyed on that name, so renaming an
*already-applied* migration would be the genuinely risky move — these renames
only mattered because nothing had successfully applied past this point yet).

### How it was verified

1. Fresh, throwaway Postgres container (not the shared dev database).
2. `prisma migrate deploy` from completely empty — repeated from scratch after
   each fix, since a failed migration blocks all subsequent ones and the
   cleanest recovery for a disposable database is just recreating it.
3. Once all 34 migrations applied cleanly:
   `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel
   packages/database/prisma/schema.prisma --script` — this must report no
   drift attributable to the new baseline migrations. (It does report a
   handful of small, pre-existing, unrelated items — a DB-only default not
   modeled in `schema.prisma`, one partial-vs-full index difference, one
   custom index name, one missing foreign key on an already-shipped column —
   all in migrations that were not touched here. Worth cleaning up separately,
   but none of them block a fresh deploy.)
4. Booted the actual NestJS API against the resulting database and confirmed
   `Nest application successfully started`, including pg-boss connecting and
   every cron schedule registering — the load-bearing proof for the
   `jobs.pgBossId` fix, since that bug only manifests when a real job is
   actually claimed, not from schema inspection alone.

If you need to reproduce this check yourself: spin up a disposable Postgres
container, run `prisma migrate deploy` against it from scratch, and if it
completes, run the `prisma migrate diff --from-url ... --to-schema-datamodel
...` command above. An empty (or unsurprising) diff is the signal that the
migration history and `schema.prisma` genuinely agree.
