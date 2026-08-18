-- Migration: 20260320b_baseline_core_schema
--
-- This is a reconstructed baseline. The original core schema (users, offers,
-- the signing/acceptance pipeline, etc.) was never captured as a migration —
-- history begins mid-structure at 20260320_create_organizations, meaning
-- `prisma migrate deploy` could never bootstrap a genuinely fresh database
-- (it would fail on the first migration that references a table no migration
-- ever creates, e.g. `ALTER TABLE "users" ...` in 20260322).
--
-- This migration recreates that missing baseline, reconstructed from the
-- current schema.prisma via `prisma migrate diff --from-empty
-- --to-schema-datamodel`, with every column/index/constraint that a LATER
-- existing migration adds deliberately EXCLUDED here so that migration still
-- applies cleanly afterwards (see each exclusion note below). Verified by
-- replaying baseline + all existing migrations against a fresh database and
-- confirming `prisma migrate diff --from-url <db> --to-schema-datamodel
-- schema.prisma` reports no drift.
--
-- Placed after 20260320_create_organizations (users/offers/etc. FK to
-- organizations) and before 20260321_create_orgrole_enum — memberships and
-- invites need the OrgRole type that migration creates, so they're deferred
-- to 20260321b_baseline_memberships_invites instead of included here.

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY', 'DELETED');
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'INTERNAL_SUPPORT');
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'VIEWED', 'OTP_VERIFIED', 'ACCEPTED', 'DECLINED', 'EXPIRED');
CREATE TYPE "SessionStatus" AS ENUM ('AWAITING_OTP', 'OTP_VERIFIED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'ABANDONED');
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL');
CREATE TYPE "OtpChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED', 'INVALIDATED');
CREATE TYPE "SigningEventType" AS ENUM ('SESSION_STARTED', 'SESSION_EXPIRED', 'SESSION_ABANDONED', 'DOCUMENT_VIEWED', 'OTP_ISSUED', 'OTP_ATTEMPT_FAILED', 'OTP_MAX_ATTEMPTS', 'OTP_VERIFIED', 'OFFER_ACCEPTED', 'OFFER_DECLINED');
CREATE TYPE "DeliveryOutcome" AS ENUM ('DISPATCHING', 'DELIVERED_TO_PROVIDER', 'FAILED');
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "hashedPassword" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- "familyId" excluded — added by 20260411_session_family_id
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- "termsVersionAtCreation" excluded — added by 20260412_legal_acceptance
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_documents" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_documents_pkey" PRIMARY KEY ("id")
);

-- "version" excluded — added by 20260705_offer_snapshot_version
CREATE TABLE "offer_snapshots" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_snapshot_documents" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256Hash" TEXT NOT NULL,

    CONSTRAINT "offer_snapshot_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_recipients" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tokenInvalidatedAt" TIMESTAMP(3),
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signing_sessions" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'AWAITING_OTP',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "otpVerifiedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signing_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signing_otp_challenges" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL DEFAULT 'EMAIL',
    "deliveryAddress" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "OtpChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "verifiedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signing_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signing_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "eventType" "SigningEventType" NOT NULL,
    "payload" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "previousEventHash" TEXT,
    "eventHash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signing_events_pkey" PRIMARY KEY ("id")
);

-- "recipientName" excluded — added by 20260412_acceptance_record_recipient_name
-- "acceptanceStatementVersion" excluded — added by 20260412_legal_acceptance
CREATE TABLE "acceptance_records" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "acceptanceStatement" TEXT NOT NULL,
    "verifiedEmail" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "locale" TEXT,
    "timezone" TEXT,
    "snapshotContentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_records_pkey" PRIMARY KEY ("id")
);

-- "canonicalHash" excluded — added by 20260328_certificate_canonical_hash
-- "snapshotId" excluded — added by 20260403_schema_hardening
-- "id" DEFAULT excluded — set by 20260328_certificate_uuid_default
CREATE TABLE "acceptance_certificates" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "acceptanceRecordId" TEXT NOT NULL,
    "certificateHash" TEXT NOT NULL,
    "pdfStorageKey" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_certificates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_delivery_attempts" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "outcome" "DeliveryOutcome" NOT NULL,
    "failureCode" INTEGER,
    "failureReason" TEXT,
    "attemptedBy" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "support_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "monthlyOfferCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsageReset" TIMESTAMP(3),
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "files_s3Key_key" ON "files"("s3Key");
CREATE INDEX "files_organizationId_idx" ON "files"("organizationId");

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
-- sessions_familyId_idx excluded — added by 20260411_session_family_id

CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

CREATE INDEX "offers_organizationId_status_idx" ON "offers"("organizationId", "status");
CREATE INDEX "offers_createdById_idx" ON "offers"("createdById");
-- offers_status_expiresAt_idx excluded — added by 20260323_offer_status_expiresat_index
-- offers_organizationId_createdAt_id_idx excluded — added by 20260410_offers_cursor_index
-- (that migration uses the custom name "offers_org_created_id_idx" for the same columns)

CREATE INDEX "offer_documents_offerId_idx" ON "offer_documents"("offerId");

CREATE UNIQUE INDEX "offer_snapshots_offerId_key" ON "offer_snapshots"("offerId");

CREATE INDEX "offer_snapshot_documents_snapshotId_idx" ON "offer_snapshot_documents"("snapshotId");
CREATE UNIQUE INDEX "offer_snapshot_documents_snapshotId_documentId_key" ON "offer_snapshot_documents"("snapshotId", "documentId");

CREATE UNIQUE INDEX "offer_recipients_offerId_key" ON "offer_recipients"("offerId");
CREATE UNIQUE INDEX "offer_recipients_tokenHash_key" ON "offer_recipients"("tokenHash");
-- offer_recipients_offerId_version_idx excluded — added by 20260403_schema_hardening

CREATE INDEX "signing_sessions_recipientId_idx" ON "signing_sessions"("recipientId");
CREATE INDEX "signing_sessions_offerId_idx" ON "signing_sessions"("offerId");
CREATE INDEX "signing_sessions_snapshotId_idx" ON "signing_sessions"("snapshotId");

CREATE INDEX "signing_otp_challenges_sessionId_idx" ON "signing_otp_challenges"("sessionId");
CREATE INDEX "signing_otp_challenges_recipientId_idx" ON "signing_otp_challenges"("recipientId");

CREATE INDEX "signing_events_sessionId_idx" ON "signing_events"("sessionId");
CREATE INDEX "signing_events_timestamp_idx" ON "signing_events"("timestamp");
-- signing_events_sessionId_timestamp_idx excluded — added by 20260403_schema_hardening
CREATE UNIQUE INDEX "signing_events_sessionId_sequenceNumber_key" ON "signing_events"("sessionId", "sequenceNumber");

CREATE UNIQUE INDEX "acceptance_records_sessionId_key" ON "acceptance_records"("sessionId");
-- Plain (non-unique) index — 20260326_acceptance_record_unique_snapshot drops this
-- by name and replaces it with a UNIQUE constraint of the same target column.
CREATE INDEX "acceptance_records_snapshotId_idx" ON "acceptance_records"("snapshotId");
CREATE INDEX "acceptance_records_recipientId_idx" ON "acceptance_records"("recipientId");

CREATE UNIQUE INDEX "acceptance_certificates_offerId_key" ON "acceptance_certificates"("offerId");
CREATE UNIQUE INDEX "acceptance_certificates_acceptanceRecordId_key" ON "acceptance_certificates"("acceptanceRecordId");
-- acceptance_certificates_snapshotId_key excluded — added by 20260403_schema_hardening

CREATE INDEX "offer_delivery_attempts_offerId_idx" ON "offer_delivery_attempts"("offerId");
CREATE INDEX "offer_delivery_attempts_attemptedAt_idx" ON "offer_delivery_attempts"("attemptedAt");
-- offer_delivery_attempts_tokenHash_idx excluded — added by 20260403_schema_hardening

CREATE INDEX "support_audit_logs_actorId_idx" ON "support_audit_logs"("actorId");
CREATE INDEX "support_audit_logs_resourceType_resourceId_idx" ON "support_audit_logs"("resourceType", "resourceId");
CREATE INDEX "support_audit_logs_timestamp_idx" ON "support_audit_logs"("timestamp");

CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- ─── Foreign keys ───────────────────────────────────────────────────────────

ALTER TABLE "files" ADD CONSTRAINT "files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_documents" ADD CONSTRAINT "offer_documents_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_snapshots" ADD CONSTRAINT "offer_snapshots_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_snapshot_documents" ADD CONSTRAINT "offer_snapshot_documents_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "offer_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_snapshot_documents" ADD CONSTRAINT "offer_snapshot_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "offer_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_recipients" ADD CONSTRAINT "offer_recipients_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "offer_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "offer_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signing_otp_challenges" ADD CONSTRAINT "signing_otp_challenges_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "signing_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signing_otp_challenges" ADD CONSTRAINT "signing_otp_challenges_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "offer_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "signing_events" ADD CONSTRAINT "signing_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "signing_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "signing_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "offer_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_certificates" ADD CONSTRAINT "acceptance_certificates_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_certificates" ADD CONSTRAINT "acceptance_certificates_acceptanceRecordId_fkey" FOREIGN KEY ("acceptanceRecordId") REFERENCES "acceptance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "offer_delivery_attempts" ADD CONSTRAINT "offer_delivery_attempts_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
