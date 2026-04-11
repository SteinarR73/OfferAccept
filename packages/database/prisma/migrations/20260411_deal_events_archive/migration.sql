-- DealEvent archival table and supporting infrastructure.
--
-- STRATEGY
-- ─────────
-- Events older than 18 months are moved from `deal_events` (hot table) to
-- `deal_events_archive` (cold table) by the `archive-deal-events` pg-boss job.
--
-- The archive table is structurally identical to deal_events but:
--   1. Has no foreign key to offers — the offer may have been deleted.
--   2. Has an archivedAt column recording when the row was moved.
--   3. Is indexed only on (dealId, archivedAt) — analytical queries, not hot paths.
--
-- RETENTION POLICY
-- ─────────────────
-- Active (deal_events):   rows created within the last 18 months
-- Archive (deal_events_archive): rows 18+ months old
-- Deletion from archive:  never by default; set DEAL_EVENT_ARCHIVE_RETENTION_MONTHS
--                         to enable hard deletion (requires separate policy decision)
--
-- IMMUTABILITY
-- ─────────────
-- deal_events is append-only per the existing architecture.
-- deal_events_archive inherits this property — the archival job only INSERTs
-- and never UPDATEs archive rows. The source rows are deleted from deal_events
-- only after a successful INSERT with a verification count check.

-- ── Archive table ─────────────────────────────────────────────────────────────

CREATE TABLE "deal_events_archive" (
    "id"         TEXT         NOT NULL,
    "dealId"     TEXT         NOT NULL,
    "eventType"  "DealEventType" NOT NULL,
    "metadata"   JSONB,
    "createdAt"  TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_events_archive_pkey" PRIMARY KEY ("id")
);

-- Timeline queries within a deal (replays historical events for a deal)
CREATE INDEX "deal_events_archive_dealId_createdAt_idx"
    ON "deal_events_archive"("dealId", "createdAt" ASC);

-- Archival job cursor: find the oldest batch not yet archived
CREATE INDEX "deal_events_archive_archivedAt_idx"
    ON "deal_events_archive"("archivedAt" DESC);

-- ── Archival job configuration table ─────────────────────────────────────────
-- Records the last successful archival run for observability and restart safety.
-- A single row tracks global state; the job uses it to avoid re-scanning rows.

CREATE TABLE "archival_checkpoint" (
    "id"               TEXT         NOT NULL DEFAULT 'deal_events',
    "lastArchivedAt"   TIMESTAMP(3),      -- createdAt of the oldest row in the last batch
    "lastRunAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowsArchived"     INTEGER      NOT NULL DEFAULT 0,
    "totalRowsArchived" BIGINT      NOT NULL DEFAULT 0,

    CONSTRAINT "archival_checkpoint_pkey" PRIMARY KEY ("id")
);

INSERT INTO "archival_checkpoint" ("id") VALUES ('deal_events')
    ON CONFLICT ("id") DO NOTHING;

-- ── Source table index for archival cursor ────────────────────────────────────
-- The archival job runs:
--   SELECT ... FROM deal_events WHERE createdAt < NOW() - INTERVAL '18 months'
--   ORDER BY createdAt ASC LIMIT <batch_size>
-- The existing @@index([createdAt]) in deal_events covers this scan.
-- No new index needed on the source table.
