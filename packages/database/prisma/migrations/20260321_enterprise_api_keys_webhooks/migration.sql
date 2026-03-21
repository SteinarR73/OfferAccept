-- Migration: enterprise-api-keys-webhooks
-- Adds API key management and outgoing webhook infrastructure.

-- ─── ApiKey ────────────────────────────────────────────────────────────────────

CREATE TABLE "api_keys" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           VARCHAR(100) NOT NULL,
    "keyHash"        TEXT NOT NULL,
    "keyPrefix"      VARCHAR(16) NOT NULL,
    "lastUsedAt"     TIMESTAMP(3),
    "expiresAt"      TIMESTAMP(3),
    "revokedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById"    TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── WebhookEndpoint ───────────────────────────────────────────────────────────

CREATE TABLE "webhook_endpoints" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url"            TEXT NOT NULL,
    "secret"         VARCHAR(64) NOT NULL,
    "events"         TEXT[] NOT NULL DEFAULT '{}',
    "enabled"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_endpoints_organizationId_idx" ON "webhook_endpoints"("organizationId");

ALTER TABLE "webhook_endpoints"
    ADD CONSTRAINT "webhook_endpoints_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── WebhookDeliveryAttempt ────────────────────────────────────────────────────

CREATE TABLE "webhook_delivery_attempts" (
    "id"             TEXT NOT NULL,
    "endpointId"     TEXT NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "event"          TEXT NOT NULL,
    "httpStatus"     INTEGER,
    "responseBody"   TEXT,
    "attempt"        INTEGER NOT NULL,
    "success"        BOOLEAN NOT NULL,
    "deliveredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_delivery_attempts_endpointId_idx"
    ON "webhook_delivery_attempts"("endpointId");
CREATE INDEX "webhook_delivery_attempts_endpointId_webhookEventId_idx"
    ON "webhook_delivery_attempts"("endpointId", "webhookEventId");

ALTER TABLE "webhook_delivery_attempts"
    ADD CONSTRAINT "webhook_delivery_attempts_endpointId_fkey"
    FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
