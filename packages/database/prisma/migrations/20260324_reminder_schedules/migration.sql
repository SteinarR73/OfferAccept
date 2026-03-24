-- ─── Migration: reminder_schedules ────────────────────────────────────────────
-- Adds the ReminderSchedule table that backs the automated recipient reminder
-- and sender expiry-warning system.
--
-- One row per SENT offer. Created on send, deleted on terminal state.
-- The send-reminders cron job (every 5 min) sweeps this table.

CREATE TABLE "reminder_schedules" (
    "id"               TEXT        NOT NULL,
    "offerId"          TEXT        NOT NULL,
    "dealSentAt"       TIMESTAMP(3) NOT NULL,
    -- null when all 3 reminders have been sent
    "nextReminderAt"   TIMESTAMP(3),
    "reminderCount"    INTEGER     NOT NULL DEFAULT 0,
    "warning24hSentAt" TIMESTAMP(3),
    "warning2hSentAt"  TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_schedules_pkey" PRIMARY KEY ("id")
);

-- One reminder schedule per offer (enforced at DB level)
CREATE UNIQUE INDEX "reminder_schedules_offerId_key" ON "reminder_schedules"("offerId");

-- Sweep index: WHERE nextReminderAt <= NOW() AND nextReminderAt IS NOT NULL
CREATE INDEX "reminder_schedules_nextReminderAt_idx" ON "reminder_schedules"("nextReminderAt");

-- FK: offer must exist
ALTER TABLE "reminder_schedules"
    ADD CONSTRAINT "reminder_schedules_offerId_fkey"
    FOREIGN KEY ("offerId")
    REFERENCES "offers"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
