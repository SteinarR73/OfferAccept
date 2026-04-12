-- Phase 4 (MEDIUM-4): Add hash chain to DealEvent and DealEventArchive.
--
-- STRATEGY
-- ─────────
-- Each DealEvent is linked to its predecessor via previousEventHash.
-- The hash covers: dealId | sequenceNumber | eventType | canonicalMetadata | createdAt | prevHash
--
-- Fields are nullable for backward compatibility.  Events created before this
-- migration have NULL chain fields and are treated as a pre-chain boundary by
-- DealEventService.verifyChain().
--
-- ARCHIVE TABLE
-- ─────────────
-- DealEventArchive gains the same nullable fields so chain data is preserved
-- through archival.  The archival job copies the chain fields verbatim.
--
-- UNIQUENESS
-- ──────────
-- (dealId, sequenceNumber) must be unique for chaining to work correctly.
-- NULL values in sequenceNumber are excluded from the UNIQUE constraint by
-- Postgres's standard NULL ≠ NULL semantics (multiple NULLs are permitted).

-- ── deal_events ────────────────────────────────────────────────────────────────

ALTER TABLE "deal_events"
    ADD COLUMN "sequenceNumber"    INTEGER,
    ADD COLUMN "previousEventHash" TEXT,
    ADD COLUMN "eventHash"         TEXT;

-- Enforce uniqueness for chained (non-legacy) events only.
-- Postgres UNIQUE constraints skip NULL values, so legacy rows do not conflict.
CREATE UNIQUE INDEX "deal_events_dealId_sequenceNumber_key"
    ON "deal_events"("dealId", "sequenceNumber");

-- ── deal_events_archive ────────────────────────────────────────────────────────

ALTER TABLE "deal_events_archive"
    ADD COLUMN "sequenceNumber"    INTEGER,
    ADD COLUMN "previousEventHash" TEXT,
    ADD COLUMN "eventHash"         TEXT;
