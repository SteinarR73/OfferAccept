-- Make AcceptanceCertificate.snapshotId NOT NULL.
--
-- PRECONDITION — do not run this migration until the verification queries in
-- docs/operations.md §"Certificate Snapshot Backfill Verification" return zero rows:
--
--   SELECT COUNT(*) FROM acceptance_certificates WHERE "snapshotId" IS NULL;
--   -- Expected: 0
--
--   SELECT ac.id FROM acceptance_certificates ac
--   LEFT JOIN offer_snapshots os ON os.id = ac."snapshotId"
--   WHERE os.id IS NULL;
--   -- Expected: 0 rows
--
-- Running before verification will fail with a NOT NULL constraint violation if
-- any certificate rows were not backfilled.
--
-- After this migration, the Prisma schema field should be updated from:
--   snapshotId String? @unique
-- to:
--   snapshotId String  @unique
-- and a corresponding migration generated to keep schema and DB in sync.

ALTER TABLE acceptance_certificates
  ALTER COLUMN "snapshotId" SET NOT NULL;
