-- DB-level safety net: one AcceptanceRecord per offer.
--
-- Why this constraint is needed:
--   The acceptance transaction uses a compare-and-swap on Offer.status to prevent
--   two concurrent acceptances from both committing. Under normal operation this
--   CAS is sufficient. However the database must independently guarantee the
--   invariant: if the application layer ever has a bug or two requests slip through
--   simultaneously, a second INSERT into acceptance_records for the same offer must
--   be rejected at the storage layer — not silently committed.
--
-- How the uniqueness chain works:
--   AcceptanceRecord.snapshotId → OfferSnapshot.id
--   OfferSnapshot.offerId is already UNIQUE (one snapshot per offer).
--   Therefore UNIQUE(snapshotId) on acceptance_records is equivalent to
--   UNIQUE per offer — no denormalisation of offerId required.
--
-- Index note:
--   The existing plain index acceptance_records_snapshotId_idx is dropped first.
--   The new UNIQUE constraint creates its own B-tree index — keeping both would
--   be redundant and waste storage + write overhead.

-- Step 1: drop the now-superseded plain index
DROP INDEX IF EXISTS "acceptance_records_snapshotId_idx";

-- Step 2: add the unique constraint
--   CONCURRENTLY is not used here because Prisma migrations run inside a
--   transaction. The table is expected to be empty (or very small) on first
--   deployment, so a brief lock is acceptable.
ALTER TABLE "acceptance_records"
    ADD CONSTRAINT "acceptance_records_snapshotId_key" UNIQUE ("snapshotId");
