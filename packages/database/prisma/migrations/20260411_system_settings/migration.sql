-- CreateTable: system_settings
-- Platform-level key/value store for admin-configurable settings.
-- Keys are a closed set enforced by the application layer (AdminSettingsService).
-- Values are JSON-encoded strings so any scalar type can be stored without
-- further schema changes.

CREATE TABLE "system_settings" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
