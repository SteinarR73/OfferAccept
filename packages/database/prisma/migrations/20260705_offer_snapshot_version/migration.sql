-- Migration: 20260705_offer_snapshot_version
-- Adds version to offer_snapshots — see schema.prisma comment on OfferSnapshot.version
-- for why this is a forward-compatible, currently-inert field (always 1 today).

-- ─── OfferSnapshot: version ──────────────────────────────────────────────────
-- NOT NULL with DEFAULT 1 — every existing row genuinely is version 1 of its
-- offer (offerId is @unique, one snapshot per offer for the lifetime of the
-- system today), so the default backfills correctly with no data migration.

ALTER TABLE "offer_snapshots" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
