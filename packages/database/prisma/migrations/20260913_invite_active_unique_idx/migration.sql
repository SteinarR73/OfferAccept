-- CreateIndex
-- Partial unique index ensuring that at most one active (unaccepted and unrevoked)
-- invitation can exist for any (organizationId, email) tuple at any given time.
-- This prevents race conditions under concurrent invite requests.
--
-- NOTE: Prisma schema syntax does not currently support partial indexes (WHERE clause).
-- This index is therefore maintained directly via this migration.

CREATE UNIQUE INDEX "invites_org_email_active_idx"
  ON "invites"("organizationId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
