-- Backfill AcceptanceCertificate.snapshotId from AcceptanceRecord.snapshotId.
--
-- AcceptanceRecord.snapshotId is @unique and was set at acceptance time from the
-- signing session. AcceptanceCertificate.snapshotId was added in the hardening
-- patch (20260403) as nullable. This migration copies the value across so every
-- certificate has a direct FK to its source snapshot.
--
-- Safety guarantees:
--   - WHERE ac."snapshotId" IS NULL — idempotent; already-populated rows are skipped.
--   - No constraint changes in this migration — those run after verification (20260405).
--   - AcceptanceRecord is immutable — the source value cannot have changed since issuance.
--   - Certificates already issued remain valid; their hashes are not touched.

UPDATE acceptance_certificates ac
SET "snapshotId" = ar."snapshotId"
FROM acceptance_records ar
WHERE ar.id = ac."acceptanceRecordId"
  AND ac."snapshotId" IS NULL;
