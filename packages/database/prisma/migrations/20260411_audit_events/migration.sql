-- CreateTable: audit_events
-- Append-only structured audit log for significant write operations.
-- type: machine-readable event identifier (e.g. "package.activated").
-- payload: arbitrary JSONB metadata recorded at event time.
-- Rows are NEVER updated or deleted.

CREATE TABLE "audit_events" (
    "id"        TEXT         NOT NULL,
    "type"      VARCHAR(100) NOT NULL,
    "payload"   JSONB        NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- Index: filter by event type
CREATE INDEX "audit_events_type_idx" ON "audit_events"("type");

-- Index: time-range queries and compliance sweeps
CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");
