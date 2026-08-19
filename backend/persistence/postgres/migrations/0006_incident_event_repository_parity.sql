-- ============================================================================
-- AIRA PHASE 13.4A
-- MIGRATION 0006 — INCIDENT EVENT REPOSITORY PARITY
-- ============================================================================
--
-- Purpose:
--
-- Bring PostgreSQL incident_events into parity with the repository contract
-- already used by AIRA.
--
-- IMPORTANT:
--
-- 0002 has already been applied and checksum recorded.
-- Never rewrite an applied migration.
-- Schema evolution happens only through forward migrations.
-- ============================================================================


-- ============================================================================
-- PROCESSING STATE
-- ============================================================================

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS processing_time_ms BIGINT;


-- ============================================================================
-- SAFETY CONSTRAINTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incident_events_processing_time_nonnegative'
      AND conrelid = 'incidents.incident_events'::regclass
  ) THEN
    ALTER TABLE incidents.incident_events
      ADD CONSTRAINT incident_events_processing_time_nonnegative
      CHECK (
        processing_time_ms IS NULL
        OR processing_time_ms >= 0
      );
  END IF;
END
$$;


-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS
  idx_incident_events_processing_status
ON incidents.incident_events (
  organization_id,
  environment_id,
  status,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_incident_events_processed_at
ON incidents.incident_events (
  organization_id,
  environment_id,
  processed_at DESC
)
WHERE processed_at IS NOT NULL;


-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN incidents.incident_events.public_id IS
  'Canonical AIRA incident event identifier. Maps to IncidentEvent.eventId.';

COMMENT ON COLUMN incidents.incident_events.status IS
  'Processing state used by IncidentEventRepository.';

COMMENT ON COLUMN incidents.incident_events.processed_at IS
  'Timestamp when the event completed processing.';

COMMENT ON COLUMN incidents.incident_events.processing_time_ms IS
  'Measured event processing duration in milliseconds.';