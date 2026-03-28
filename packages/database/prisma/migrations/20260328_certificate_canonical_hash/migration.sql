-- Add canonicalHash to acceptance_certificates.
-- Nullable: existing certificates do not have this value and verification
-- gracefully skips the check when the column is NULL.

ALTER TABLE "acceptance_certificates" ADD COLUMN "canonicalHash" TEXT;
