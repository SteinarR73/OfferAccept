-- Enforce append-only on the evidence tables at the database level.
--
-- AcceptanceRecord, OfferSnapshot, OfferSnapshotDocument and SigningEvent are the
-- legal evidence behind every acceptance certificate. Until now "append-only" was a
-- convention in application code only: nothing in Postgres stopped an UPDATE, DELETE
-- or TRUNCATE from a bug, a SQL injection, a stray migration or a careless psql session.
-- A smoke test against a fresh database confirmed rows could be rewritten and deleted
-- without error, and certificate verification did not notice deleted signing events.
--
-- These triggers make such statements fail. INSERT and SELECT are unaffected.
--
-- Scope and limits (be honest about what this does and does not protect):
--   * It stops accidental and application-level mutation, including from superusers
--     running normal statements.
--   * It does NOT stop a DB owner/superuser who deliberately runs
--     `ALTER TABLE ... DISABLE TRIGGER` or sets `session_replication_role = replica`.
--     Defending against that needs role separation: run the application as a role that
--     does not own these tables and has no TRIGGER privilege on them.
--
-- Existing foreign keys onto these tables are all ON DELETE RESTRICT, so no cascade
-- can reach these triggers; nothing in application code updates or deletes these rows.
--
-- Rollback (only with a deliberate, reviewed need to mutate evidence):
--   DROP TRIGGER <name> ON <table>;  for each trigger below, then
--   DROP FUNCTION prevent_evidence_mutation();

CREATE OR REPLACE FUNCTION prevent_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% on "%" is not allowed: the table is append-only evidence',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Evidence rows are immutable. Insert a new row instead of changing history.';
END;
$$;

-- Row-level: UPDATE and DELETE.
CREATE TRIGGER "acceptance_records_append_only"
  BEFORE UPDATE OR DELETE ON "acceptance_records"
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_mutation();

CREATE TRIGGER "offer_snapshots_append_only"
  BEFORE UPDATE OR DELETE ON "offer_snapshots"
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_mutation();

CREATE TRIGGER "offer_snapshot_documents_append_only"
  BEFORE UPDATE OR DELETE ON "offer_snapshot_documents"
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_mutation();

CREATE TRIGGER "signing_events_append_only"
  BEFORE UPDATE OR DELETE ON "signing_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_mutation();

-- Statement-level: TRUNCATE bypasses row triggers, so it needs its own.
CREATE TRIGGER "acceptance_records_no_truncate"
  BEFORE TRUNCATE ON "acceptance_records"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_evidence_mutation();

CREATE TRIGGER "offer_snapshots_no_truncate"
  BEFORE TRUNCATE ON "offer_snapshots"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_evidence_mutation();

CREATE TRIGGER "offer_snapshot_documents_no_truncate"
  BEFORE TRUNCATE ON "offer_snapshot_documents"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_evidence_mutation();

CREATE TRIGGER "signing_events_no_truncate"
  BEFORE TRUNCATE ON "signing_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_evidence_mutation();
