-- Migration: multi-org canonical source + VIEWER role
-- 1. Add VIEWER to OrgRole enum
-- 2. Make User.organizationId nullable (Membership is now canonical)

-- Step 1: add the new enum value
-- IF NOT EXISTS guards against the case where 20260321_create_orgrole_enum
-- already includes 'VIEWER' in its initial CREATE TYPE (it does, as committed
-- today) — without this guard, a fresh `migrate deploy` replay fails here with
-- "enum label VIEWER already exists" (error 42710) and can never get past
-- migration #4. Already-applied environments are unaffected (Prisma skips
-- migrations it has already recorded, regardless of file content).
ALTER TYPE "OrgRole" ADD VALUE IF NOT EXISTS 'VIEWER';

-- Step 2: make User.organizationId nullable
-- All existing rows have a non-null value — this is safe.
ALTER TABLE "users" ALTER COLUMN "organizationId" DROP NOT NULL;
