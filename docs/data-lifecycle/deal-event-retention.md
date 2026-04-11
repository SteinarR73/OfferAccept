# DealEvent Retention Policy

## Overview

`DealEvent` rows are the append-only audit trail of deal state transitions (created, viewed,
signed, expired, etc.). They are written at high frequency and accumulate indefinitely
without a retention policy.

The archival job moves rows older than the configured retention window from the hot table
(`deal_events`) to a cold archive table (`deal_events_archive`) on a nightly schedule.

---

## Tables

### `deal_events` (hot)

Contains events created within the retention window. Subject to normal Prisma queries,
foreign-key constraints, and indexed for low-latency lookups by `dealId`.

### `deal_events_archive` (cold)

Structurally identical to `deal_events` with two differences:

| Column      | Detail |
|-------------|--------|
| `archivedAt`| Timestamp when the row was moved (default: `CURRENT_TIMESTAMP`) |
| No FK       | `dealId` has no foreign key — the originating deal may have been deleted |

The archive table is indexed on `(dealId, createdAt ASC)` for event-replay queries and
`archivedAt DESC` for archival job cursor queries.

---

## Retention Window

| Store                  | Retention       | Configurable via                    |
|------------------------|-----------------|-------------------------------------|
| `deal_events` (hot)    | 18 months       | `DEAL_EVENT_RETENTION_MONTHS`       |
| `deal_events_archive`  | Indefinite      | No policy by default                |

Hard deletion from the archive is **not enabled by default**. If a future compliance
requirement mandates deletion (e.g. GDPR right-to-erasure for deal metadata), implement
a separate purge job gated on `DEAL_EVENT_ARCHIVE_RETENTION_MONTHS`.

---

## Archival Job

**Job name:** `archive-deal-events`  
**Schedule:** `0 2 * * *` (02:00 UTC daily)  
**Handler:** [apps/api/src/modules/jobs/handlers/archive-deal-events.handler.ts](../../apps/api/src/modules/jobs/handlers/archive-deal-events.handler.ts)

### Algorithm

Each nightly run:

1. **SELECT** up to `batchSize` rows from `deal_events` where `createdAt < cutoff`,
   ordered `ASC` (oldest first).
2. **INSERT** those rows into `deal_events_archive` using `skipDuplicates: true`
   (maps to `ON CONFLICT DO NOTHING` in PostgreSQL — idempotent on retry).
3. **DELETE** the same IDs from `deal_events`.
4. Steps 2–3 execute inside a single Prisma **$transaction**. A partial failure
   cannot produce phantom deletions or duplicate archive rows.
5. **Upsert** the `archival_checkpoint` row (outside the transaction — non-critical).

### Configuration

| Env var                           | Default | Description                               |
|-----------------------------------|---------|-------------------------------------------|
| `DEAL_EVENT_RETENTION_MONTHS`     | `18`    | Age threshold before rows are eligible    |
| `DEAL_EVENT_ARCHIVE_BATCH_SIZE`   | `10000` | Max rows moved per run                    |

If the backlog exceeds `batchSize`, subsequent daily runs clear it progressively.
There is no need to increase batch size urgently — the job will catch up automatically.

### Idempotency

- **INSERT … ON CONFLICT DO NOTHING** ensures retried runs never duplicate archive rows.
- **DELETE by ID set** ensures rows are not removed from the source table before they
  are confirmed in the archive.
- A count mismatch between inserted and deleted rows is logged as a warning but is
  non-fatal (the delta represents rows deleted externally between the SELECT and DELETE).

---

## Progress Tracking

The `archival_checkpoint` table holds a single row (`id = 'deal_events'`) that records:

| Column              | Meaning                                           |
|---------------------|---------------------------------------------------|
| `lastArchivedAt`    | `createdAt` of the oldest row in the last batch  |
| `lastRunAt`         | Timestamp of the last successful run             |
| `rowsArchived`      | Rows moved in the most recent run                |
| `totalRowsArchived` | Cumulative count across all runs (BIGINT)        |

Query to check status:

```sql
SELECT
    id,
    "lastArchivedAt",
    "lastRunAt",
    "rowsArchived",
    "totalRowsArchived"
FROM archival_checkpoint
WHERE id = 'deal_events';
```

---

## Monitoring

### Check current backlog size

```sql
SELECT count(*) AS backlog
FROM deal_events
WHERE "createdAt" < NOW() - INTERVAL '18 months';
```

### Verify archival is running

```sql
SELECT "lastRunAt", "rowsArchived", "totalRowsArchived"
FROM archival_checkpoint
WHERE id = 'deal_events'
  AND "lastRunAt" > NOW() - INTERVAL '25 hours'; -- alert if absent
```

### Archive table growth

```sql
SELECT
    date_trunc('month', "archivedAt") AS month,
    count(*) AS rows_archived
FROM deal_events_archive
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12;
```

### DLQ check (if a run fails three times)

```sql
SELECT name, count(*), max(archivedon) AS latest
FROM pgboss.archive
WHERE name = 'archive-deal-events'
  AND archivedon > NOW() - INTERVAL '48 hours'
GROUP BY name;
```

---

## Schema

Migration: `packages/database/prisma/migrations/20260411_deal_events_archive/migration.sql`

```
deal_events_archive
  id         TEXT          PK
  dealId     TEXT          (no FK)
  eventType  DealEventType
  metadata   JSONB?
  createdAt  TIMESTAMP(3)
  archivedAt TIMESTAMP(3)  DEFAULT CURRENT_TIMESTAMP

  INDEX (dealId, createdAt ASC)
  INDEX (archivedAt DESC)

archival_checkpoint
  id                 TEXT    PK  DEFAULT 'deal_events'
  lastArchivedAt     TIMESTAMP(3)?
  lastRunAt          TIMESTAMP(3)  DEFAULT CURRENT_TIMESTAMP
  rowsArchived       INT     DEFAULT 0
  totalRowsArchived  BIGINT  DEFAULT 0
```

---

## Operational Runbook

### Manual backfill after a gap in archival runs

If archival failed for several days and the backlog is large, increase batch size temporarily:

```bash
DEAL_EVENT_ARCHIVE_BATCH_SIZE=50000 node -e "
  // Or restart the API process with the env override —
  // the job handler reads the env var at construction time.
"
```

Then manually trigger via pg-boss:

```sql
INSERT INTO pgboss.job (name, data, state)
VALUES ('archive-deal-events', '{}', 'created');
```

The job will process one oversized batch, then revert to normal on the next nightly run.

### Emergency: disable archival without code change

Set a future cutoff to effectively disable the job without removing it:

```bash
DEAL_EVENT_RETENTION_MONTHS=9999
```

Restart the API. The job will run but find zero eligible rows and exit immediately.

### Restore archived events to hot table

Archived events are not automatically restorable. If a specific deal's history is needed
after its events were archived, query `deal_events_archive` directly:

```sql
SELECT * FROM deal_events_archive
WHERE "dealId" = '<deal-id>'
ORDER BY "createdAt" ASC;
```
