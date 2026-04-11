-- Audit system hardening: structured columns, controlled enums, queryability indexes
--
-- Backward-compatibility notes:
--   • AuditEventType enum value 'package.activated' is identical to the string
--     previously stored in the text column, so the USING cast never fails on
--     existing rows.
--   • PackageType enum values (STARTER, PROFESSIONAL, etc.) match the strings
--     previously stored in user_packages.packageType, so that USING cast is
--     also safe on existing rows.
--   • actorId / entityType / entityId are nullable — existing audit_event rows
--     receive NULL for all three columns, which is correct (they predate
--     the structured columns).

-- ─── 1. Create enums ──────────────────────────────────────────────────────────

CREATE TYPE "AuditEventType" AS ENUM ('package.activated');

CREATE TYPE "PackageType" AS ENUM (
    'STARTER',
    'PROFESSIONAL',
    'ENTERPRISE',
    'ADD_ON_ESIGN'
);

-- ─── 2. Add structured columns to audit_events ────────────────────────────────
-- All nullable — existing rows are grandfathered in with NULL values.

ALTER TABLE "audit_events"
    ADD COLUMN "actorId"    TEXT,
    ADD COLUMN "entityType" VARCHAR(50),
    ADD COLUMN "entityId"   TEXT;

-- ─── 3. Migrate type column from TEXT to AuditEventType enum ─────────────────
-- DROP the existing index first; ALTER COLUMN TYPE recreates the column storage.

DROP INDEX IF EXISTS "audit_events_type_idx";

ALTER TABLE "audit_events"
    ALTER COLUMN "type" TYPE "AuditEventType"
    USING "type"::"AuditEventType";

-- ─── 4. Migrate packageType column from VARCHAR to PackageType enum ───────────

ALTER TABLE "user_packages"
    ALTER COLUMN "packageType" TYPE "PackageType"
    USING "packageType"::"PackageType";

-- ─── 5. Rebuild indexes on audit_events ──────────────────────────────────────

CREATE INDEX "audit_events_type_idx"                ON "audit_events"("type");
CREATE INDEX "audit_events_actorId_idx"             ON "audit_events"("actorId");
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");
-- createdAt index already exists from initial migration
