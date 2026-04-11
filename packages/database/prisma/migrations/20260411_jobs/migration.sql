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
-- Partial (WHERE pgBossId IS NOT NULL) to allow multiple NULL values during
-- the brief window between requeue and first re-delivery.
CREATE UNIQUE INDEX "jobs_pgBossId_key"
    ON "jobs"("pgBossId")
    WHERE "pgBossId" IS NOT NULL;

-- Index: filter jobs by status (admin DLQ, monitoring)
CREATE INDEX "jobs_status_idx"         ON "jobs"("status");

-- Index: "are there stuck jobs of type X?"
CREATE INDEX "jobs_name_status_idx"    ON "jobs"("name", "status");

-- Index: admin DLQ query — non-null deadLetteredAt = dead-lettered
CREATE INDEX "jobs_deadLetteredAt_idx" ON "jobs"("deadLetteredAt");
