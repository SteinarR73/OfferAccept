-- Migration: 20260706_acceptance_certificate_snapshot_fk
--
-- Adds the missing foreign key for AcceptanceCertificate.snapshotId.
--
-- schema.prisma has declared this relation since it was introduced:
--   snapshot OfferSnapshot @relation(fields: [snapshotId], references: [id])
-- but no prior migration ever added the actual database constraint — only the
-- column (20260403_schema_hardening), its backfill (20260404), and its NOT
-- NULL constraint (20260405). offerId and acceptanceRecordId on this same
-- table both got their FKs in the original baseline; snapshotId was missed.
--
-- ON DELETE RESTRICT ON UPDATE CASCADE matches the other two FKs on this
-- table (and the Prisma default for a required, unannotated relation),
-- consistent with this table's role as an immutable audit artifact — a
-- snapshot referenced by an issued certificate can never be deleted.

ALTER TABLE "acceptance_certificates"
  ADD CONSTRAINT "acceptance_certificates_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "offer_snapshots"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
