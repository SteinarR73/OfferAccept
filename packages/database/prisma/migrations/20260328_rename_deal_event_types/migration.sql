-- Rename DealEventType enum values from snake_case to entity.action format.
-- ALTER TYPE ... RENAME VALUE requires PostgreSQL 10+.
-- These are non-destructive renames: existing rows are updated automatically.

ALTER TYPE "DealEventType" RENAME VALUE 'deal_created'          TO 'deal.created';
ALTER TYPE "DealEventType" RENAME VALUE 'deal_sent'             TO 'deal.sent';
ALTER TYPE "DealEventType" RENAME VALUE 'deal_opened'           TO 'deal.opened';
ALTER TYPE "DealEventType" RENAME VALUE 'otp_verified'          TO 'otp.verified';
ALTER TYPE "DealEventType" RENAME VALUE 'deal_accepted'         TO 'deal.accepted';
ALTER TYPE "DealEventType" RENAME VALUE 'certificate_generated' TO 'certificate.issued';
ALTER TYPE "DealEventType" RENAME VALUE 'deal_reminder_sent'    TO 'deal.reminder_sent';
ALTER TYPE "DealEventType" RENAME VALUE 'deal_revoked'          TO 'deal.revoked';
ALTER TYPE "DealEventType" RENAME VALUE 'deal_expired'          TO 'deal.expired';
ALTER TYPE "DealEventType" RENAME VALUE 'deal_declined'         TO 'deal.declined';
