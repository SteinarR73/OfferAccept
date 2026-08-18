-- Extend AuditEventType enum to include AI call audit events.
--
-- 'ai.request' is written by AiService for every AI API call (success or failure).
-- Payload shape: { model, operation, tokens, latencyMs, success }
--
-- PostgreSQL enums cannot be extended inside a transaction, so this uses
-- ALTER TYPE ... ADD VALUE which auto-commits.
-- Migration is safe to re-run: IF NOT EXISTS prevents duplicate value errors
-- (requires PostgreSQL 14+).

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ai.request';
