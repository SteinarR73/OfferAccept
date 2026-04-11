-- Add token family tracking to sessions table.
--
-- familyId links all tokens derived from the same root login.
-- The index supports revokeFamily() which runs:
--   UPDATE sessions SET revokedAt = NOW()
--   WHERE familyId = $1 AND revokedAt IS NULL
--
-- Backward compatibility:
--   Existing rows receive NULL for familyId.
--   These "legacy" sessions have no family context and cannot trigger family
--   revocation on replay. They are grandfathered in — the next successful rotation
--   from a legacy session creates a new family root and upgrades forward.
--   Legacy sessions expire naturally at their expiresAt date.

ALTER TABLE "sessions"
    ADD COLUMN "familyId" VARCHAR(64);

-- Index: revokeFamily() lookup — covers all sessions with the same family root.
-- Partial (WHERE familyId IS NOT NULL) skips the NULL rows from legacy sessions.
CREATE INDEX "sessions_familyId_idx"
    ON "sessions"("familyId")
    WHERE "familyId" IS NOT NULL;
