-- CreateEnum + CreateTable: jobs
-- Application-level job tracking companion to pg-boss.
-- pg-boss handles delivery; this table handles observability, DLQ admin, and
-- stale-lock recovery.

CREATE TYPE "JobStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'DEAD_LETTERED'
);

CREATE TABLE "jobs" (
    "id"             TEXT         NOT NULL,
    "pgBossId"       TEXT,
    "name"           VARCHAR(100) NOT NULL,
    "payload"        JSONB        NOT NULL,
    "status"         "JobStatus"  NOT NULL DEFAULT 'PENDING',
    "attempts"       INTEGER      NOT NULL DEFAULT 0,
    "maxAttempts"    INTEGER      NOT NULL DEFAULT 3,
    "failReason"     TEXT,
    "deadLetteredAt" TIMESTAMP(3),
    "lockedAt"       TIMESTAMP(3),
    "lockedBy"       VARCHAR(200),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- pgBossId uniqueness: prevents two tracking rows for the same pg-boss job.
-- A plain (non-partial) unique index already permits unlimited NULL values —
-- Postgres never considers NULL equal to NULL for uniqueness purposes — so no
-- WHERE clause is needed for that. A partial index was tried here originally,
-- but Postgres's ON CONFLICT target resolution (which JobTrackingService's
-- `job.upsert({ where: { pgBossId } })` relies on) cannot match a partial
-- unique index unless the INSERT statement repeats its WHERE clause, which
-- Prisma's generated upsert SQL does not do — every job claim failed with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" (Postgres 42P10) on a fresh database.
CREATE UNIQUE INDEX "jobs_pgBossId_key"
    ON "jobs"("pgBossId");

-- Index: filter jobs by status (admin DLQ, monitoring)
CREATE INDEX "jobs_status_idx"         ON "jobs"("status");

-- Index: "are there stuck jobs of type X?"
CREATE INDEX "jobs_name_status_idx"    ON "jobs"("name", "status");

-- Index: admin DLQ query — non-null deadLetteredAt = dead-lettered
CREATE INDEX "jobs_deadLetteredAt_idx" ON "jobs"("deadLetteredAt");
