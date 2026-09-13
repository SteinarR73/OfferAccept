-- Migration: Drop legacy User.organizationId
--
-- Context:
-- User.organizationId was the original single-org FK before the Membership join table.
-- Migration 20260322_multiorg_viewer_role made it nullable.
-- Migration 20260408_backfill_memberships_from_user_org backfilled all accounts into memberships.
-- All authentication and organization context now flows exclusively through the Membership model.
-- This migration permanently drops the legacy column, foreign key constraint, and index.

-- 1. Safety backfill: Ensure any remaining user with organizationId has a Membership row
INSERT INTO "memberships" (
  "id",
  "userId",
  "organizationId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('c', encode(gen_random_bytes(12), 'hex')),
  u."id",
  u."organizationId",
  'OWNER',
  u."createdAt",
  NOW()
FROM "users" u
WHERE u."organizationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM   "memberships" m
    WHERE  m."userId"         = u."id"
    AND    m."organizationId" = u."organizationId"
  );

-- 2. Drop foreign key constraint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_organizationId_fkey";

-- 3. Drop index
DROP INDEX IF EXISTS "users_organizationId_idx";

-- 4. Drop column
ALTER TABLE "users" DROP COLUMN IF EXISTS "organizationId";
