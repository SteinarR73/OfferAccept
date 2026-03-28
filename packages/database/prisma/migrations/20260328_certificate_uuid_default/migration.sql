-- Change the database-level default for acceptance_certificates.id from cuid()
-- to gen_random_uuid() (UUID v4, 122 bits CSPRNG).
--
-- The application always supplies the ID explicitly, so this default is a
-- defense-in-depth measure: if the application ever omits the ID, the database
-- generates an unguessable value instead of a sequential cuid.
--
-- Existing rows are unaffected. No data migration is required.

ALTER TABLE "acceptance_certificates"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
