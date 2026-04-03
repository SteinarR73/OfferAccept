-- GDPR Art. 17 erasure request tracking.
-- Creates the erasure_requests table and the ErasureStatus enum.
-- Does NOT modify any immutable evidence tables (acceptance_records, etc.).

CREATE TYPE "ErasureStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');

CREATE TABLE "erasure_requests" (
  "id"          TEXT         NOT NULL,
  "userId"      TEXT         NOT NULL,
  "status"      "ErasureStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "adminNotes"  TEXT,

  CONSTRAINT "erasure_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "erasure_requests"
  ADD CONSTRAINT "erasure_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "erasure_requests_userId_idx"          ON "erasure_requests"("userId");
CREATE INDEX "erasure_requests_status_requestedAt_idx" ON "erasure_requests"("status", "requestedAt");
