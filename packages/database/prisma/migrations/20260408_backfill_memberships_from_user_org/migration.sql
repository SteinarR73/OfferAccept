-- Backfill Membership rows for users who have User.organizationId set
-- but no matching row in the memberships table.
--
-- Context: User.organizationId was the original single-org FK introduced before
-- the Membership join table existed. All new signups go through createOrgAndOwner
-- which inserts a Membership row in the same transaction. This backfill closes
-- the gap for any accounts created before that invariant was enforced.
--
-- After this migration runs, auth.service.ts no longer needs to fall back to
-- User.organizationId — Membership is the sole source of truth for org context.
--
-- The generated id uses a cuid-compatible prefix ('c') followed by 24 random hex
-- characters. This is structurally compatible with the application cuid format.
-- Role is set to OWNER because pre-Membership users were always org creators.

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
