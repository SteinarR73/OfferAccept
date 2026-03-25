-- CreateEnum
CREATE TYPE "DealEventType" AS ENUM (
  'deal_created',
  'deal_sent',
  'deal_opened',
  'otp_verified',
  'deal_accepted',
  'certificate_generated',
  'deal_reminder_sent',
  'deal_revoked',
  'deal_expired',
  'deal_declined'
);

-- CreateTable
CREATE TABLE "deal_events" (
    "id"        TEXT NOT NULL,
    "dealId"    TEXT NOT NULL,
    "eventType" "DealEventType" NOT NULL,
    "metadata"  JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_events_dealId_idx" ON "deal_events"("dealId");

-- CreateIndex
CREATE INDEX "deal_events_createdAt_idx" ON "deal_events"("createdAt");

-- AddForeignKey
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
