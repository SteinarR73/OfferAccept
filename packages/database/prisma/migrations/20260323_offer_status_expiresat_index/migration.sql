-- Add composite index on (status, expiresAt) to the offers table.
-- Used by the background expiry job: SELECT … WHERE status = 'SENT' AND expiresAt < NOW()
-- Without this index the job performs a full table scan on every tick.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "offers_status_expiresAt_idx"
ON "offers" ("status", "expiresAt");
