-- AddIndex
-- Supports "invitations sent by user" queries (revocation on user deletion, audit views).
-- invitedBy is a formal FK relation (invitedBy User @relation(...)). PostgreSQL does not
-- automatically create indexes for FK columns; this must be explicit.
--
-- NOTE: CREATE INDEX vs CREATE INDEX CONCURRENTLY
-- This migration uses plain CREATE INDEX, which acquires a full table lock during build.
-- For a pre-launch table with no production data this is safe.
--
-- For any future index added to a table with live traffic:
--   1. CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
--      Prisma wraps every migration in BEGIN/COMMIT, so CONCURRENTLY is incompatible
--      with prisma migrate deploy.
--   2. The correct production procedure is:
--        a. Run CREATE INDEX CONCURRENTLY in a psql session manually.
--        b. Mark the migration as applied without re-running it:
--             npx prisma migrate resolve --applied <migration_name>
--   See docs/database/postgres-migration.md §5 for the full runbook.

CREATE INDEX "invites_invitedById_idx" ON "invites"("invitedById");
