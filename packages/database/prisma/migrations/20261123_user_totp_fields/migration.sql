-- Migration: 20261123_user_totp_fields
-- Adds TOTP fields to the users table for INTERNAL_SUPPORT MFA.
-- totp_secret: AES-256-GCM encrypted base32 secret (FieldCipher wire format), null until setup
-- totp_enabled: false until the user completes setup by verifying their first code

ALTER TABLE "users" ADD COLUMN "totp_secret" TEXT;
ALTER TABLE "users" ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false;
