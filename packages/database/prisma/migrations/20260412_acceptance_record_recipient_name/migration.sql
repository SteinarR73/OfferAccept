-- Phase 2 (HIGH-2): Freeze recipient name into AcceptanceRecord.
--
-- PROBLEM
-- ────────
-- CertificatePayloadBuilder previously read recipient.name from OfferRecipient at
-- certificate generation time. OfferRecipient.name is mutable (the sender can edit
-- it), so the name embedded in a certificate could differ from the name the recipient
-- saw at acceptance time, or break verification if the name was later changed.
--
-- FIX
-- ────
-- Capture the recipient name as-of acceptance in AcceptanceRecord.recipientName.
-- CertificatePayloadBuilder now uses this frozen value. Legacy records (recipientName IS
-- NULL) fall back to reading OfferRecipient.name, preserving backward compatibility.
--
-- BACKFILL
-- ─────────
-- Fill recipientName for all existing AcceptanceRecord rows from their linked
-- OfferRecipient. This runs at migration time; after this point the application code
-- writes recipientName on every new AcceptanceRecord.

ALTER TABLE "acceptance_records" ADD COLUMN "recipientName" TEXT;

UPDATE "acceptance_records" ar
SET    "recipientName" = (
    SELECT or2."name"
    FROM   "offer_recipients" or2
    WHERE  or2."id" = ar."recipientId"
)
WHERE  ar."recipientName" IS NULL;
