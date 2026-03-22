-- Migration: multi-org canonical source + VIEWER role
-- 1. Add VIEWER to OrgRole enum
-- 2. Make User.organizationId nullable (Membership is now canonical)

-- Step 1: add the new enum value
ALTER TYPE "OrgRole" ADD VALUE 'VIEWER';

-- Step 2: make User.organizationId nullable
-- All existing rows have a non-null value — this is safe.
ALTER TABLE "users" ALTER COLUMN "organizationId" DROP NOT NULL;
