-- ============================================================================
-- AIRA PHASE 13.4E2
-- MIGRATION 0012 — WORKFLOW OUTBOX REPOSITORY PARITY
-- ============================================================================

ALTER TABLE workflow.outbox_events
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE workflow.outbox_events
ADD COLUMN IF NOT EXISTS event_key TEXT;

ALTER TABLE workflow.outbox_events
ADD COLUMN IF NOT EXISTS payload_fingerprint TEXT;

ALTER TABLE workflow.outbox_events
ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

ALTER TABLE workflow.outbox_events
ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

ALTER TABLE workflow.outbox_events
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_outbox_database_id_unique
ON workflow.outbox_events (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_outbox_event_key_unique
ON workflow.outbox_events (
  event_key
)
WHERE event_key IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_outbox_payload_fingerprint
ON workflow.outbox_events (
  payload_fingerprint
);


CREATE INDEX IF NOT EXISTS
  idx_outbox_scoped_event
ON workflow.outbox_events (
  organization_id,
  environment_id,
  public_id
);


CREATE INDEX IF NOT EXISTS
  idx_outbox_scoped_event_key
ON workflow.outbox_events (
  organization_id,
  environment_id,
  event_key
);


CREATE INDEX IF NOT EXISTS
  idx_outbox_document_gin
ON workflow.outbox_events
USING GIN (
  document
);


/*
 * Outbox must never manufacture execution authority.
 *
 * This already exists on execution_authorized itself, but the payload also
 * receives a database-level fail-closed guard.
 */
ALTER TABLE workflow.outbox_events
DROP CONSTRAINT IF EXISTS
  outbox_payload_never_authorizes_execution;


ALTER TABLE workflow.outbox_events
ADD CONSTRAINT
  outbox_payload_never_authorizes_execution
CHECK (
  COALESCE(
    (payload ->> 'executionAuthorized')::BOOLEAN,
    FALSE
  ) = FALSE
  AND
  COALESCE(
    (payload ->> 'authorizationGranted')::BOOLEAN,
    FALSE
  ) = FALSE
);