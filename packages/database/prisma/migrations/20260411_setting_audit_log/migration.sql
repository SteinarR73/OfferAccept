-- CreateTable: setting_audit_logs
-- Append-only audit trail for every admin settings change.
-- Written in the same transaction as the system_settings upsert — audit rows
-- can never exist without the matching write, and can never be missing from one.
--
-- oldValue is nullable: NULL means the key was using its compiled-in default
-- and had never been explicitly persisted before this change event.

CREATE TABLE "setting_audit_logs" (
    "id"        TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "oldValue"  TEXT,
    "newValue"  TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Index: look up audit history for a specific setting key
CREATE INDEX "setting_audit_logs_key_idx" ON "setting_audit_logs"("key");

-- Index: compliance sweeps by time range
CREATE INDEX "setting_audit_logs_changedAt_idx" ON "setting_audit_logs"("changedAt");
