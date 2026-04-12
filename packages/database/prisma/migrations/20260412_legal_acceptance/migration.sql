-- Migration: 20260412_legal_acceptance
-- Adds LegalAcceptance table for recording ToS/legal document acceptance at signup.
-- Adds termsVersionAtCreation to offers (which ToS version governed this deal).
-- Adds acceptanceStatementVersion to acceptance_records (which statement wording applied).

-- ─── LegalAcceptance ─────────────────────────────────────────────────────────
-- Append-only. Rows are NEVER updated or deleted.

CREATE TABLE "legal_acceptances" (
    "id"              TEXT         NOT NULL,
    "userId"          TEXT         NOT NULL,
    "documentType"    VARCHAR(50)  NOT NULL,
    "documentVersion" VARCHAR(20)  NOT NULL,
    "acceptedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress"       VARCHAR(45),
    "userAgent"       VARCHAR(500),

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_acceptances_userId_idx"             ON "legal_acceptances"("userId");
CREATE INDEX "legal_acceptances_userId_documentType_idx" ON "legal_acceptances"("userId", "documentType");

ALTER TABLE "legal_acceptances"
    ADD CONSTRAINT "legal_acceptances_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Offer: termsVersionAtCreation ───────────────────────────────────────────
-- Nullable — pre-existing offers will have NULL (treated as "terms unknown").

ALTER TABLE "offers" ADD COLUMN "termsVersionAtCreation" TEXT;

-- ─── AcceptanceRecord: acceptanceStatementVersion ────────────────────────────
-- Nullable — pre-existing records will have NULL (treated as "version unknown").
-- AcceptanceRecord is immutable after creation; this column is set at insert time.

ALTER TABLE "acceptance_records" ADD COLUMN "acceptanceStatementVersion" TEXT;
