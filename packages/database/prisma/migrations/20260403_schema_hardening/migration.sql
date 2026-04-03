-- Schema hardening patch — Fix 1–8
-- Safe forward-only migration. No destructive DDL.
--
-- Fix 1: uuid(4) → uuid() — Prisma-level only; no DDL change required.
--        The default function in the DB is unchanged.
--
-- Fix 2: Invite.invitedById FK declared in Prisma; column already exists.
--        No DDL required.
--
-- Fix 3: Drop the redundant index on offer_recipients(tokenHash).
--        The @unique constraint already creates an index; the @@index was
--        a duplicate. Dropping it reduces write overhead with no query impact.

DROP INDEX IF EXISTS "offer_recipients_tokenHash_idx";

-- Fix 4: SigningSession.offerId FK declared in Prisma; column already exists.
--        No DDL required — index was already present from prior migrations.

-- Fix 5: Add snapshotId to acceptance_certificates.
--        Nullable so existing rows are unaffected.
--        @unique enforces one certificate per snapshot (consistent with
--        AcceptanceRecord.snapshotId @unique + AcceptanceCertificate.acceptanceRecordId @unique).

ALTER TABLE "acceptance_certificates"
  ADD COLUMN IF NOT EXISTS "snapshotId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "acceptance_certificates_snapshotId_key"
  ON "acceptance_certificates"("snapshotId");

-- Fix 6: Composite index on signing_events(sessionId, timestamp).
--        Improves timeline queries that order by timestamp within a session.

CREATE INDEX IF NOT EXISTS "signing_events_sessionId_timestamp_idx"
  ON "signing_events"("sessionId", "timestamp");

-- Fix 7: Composite index on offer_recipients(offerId, version).
--        Improves optimistic concurrency updateMany WHERE offerId=? AND version=?.

CREATE INDEX IF NOT EXISTS "offer_recipients_offerId_version_idx"
  ON "offer_recipients"("offerId", "version");

-- Fix 8: Index on offer_delivery_attempts(tokenHash).
--        Enables support tools to look up delivery attempts by the token
--        embedded in a specific signing link email.

CREATE INDEX IF NOT EXISTS "offer_delivery_attempts_tokenHash_idx"
  ON "offer_delivery_attempts"("tokenHash");
