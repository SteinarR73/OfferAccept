-- Migration: 20260321b_baseline_memberships_invites
--
-- Part of the reconstructed baseline (see 20260320b_baseline_core_schema for
-- the full explanation). memberships and invites both use the OrgRole enum,
-- which 20260321_create_orgrole_enum creates — so they're placed here, right
-- after that migration, rather than in the earlier baseline migration.

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

CREATE UNIQUE INDEX "invites_tokenHash_key" ON "invites"("tokenHash");
CREATE INDEX "invites_organizationId_idx" ON "invites"("organizationId");
CREATE INDEX "invites_email_idx" ON "invites"("email");
-- invites_invitedById_idx excluded — added by 20260411_invite_invitedby_index

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
