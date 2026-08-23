-- ============================================================================
-- AIRA PHASE 13.4A
-- MIGRATION 0006 — INCIDENT EVENT REPOSITORY PARITY
-- ============================================================================

-- 1. PROCESSING STATE COLUMNS
ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_time_ms BIGINT;

-- 2. SAFETY CONSTRAINTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
    WHERE c.conname = 'incident_events_processing_time_nonnegative'
      AND n.nspname = 'incidents'
  ) THEN
    ALTER TABLE incidents.incident_events
      ADD CONSTRAINT incident_events_processing_time_nonnegative
      CHECK (
        processing_time_ms IS NULL
        OR processing_time_ms >= 0
      );
  END IF;
END $$;

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_incident_events_processing_status
  ON incidents.incident_events (
    organization_id,
    environment_id,
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_incident_events_processed_at
  ON incidents.incident_events (
    organization_id,
    environment_id,
    processed_at DESC
  )
  WHERE processed_at IS NOT NULL;

-- 4. DOCUMENTATION
COMMENT ON COLUMN incidents.incident_events.public_id IS
  'Canonical AIRA incident event identifier. Maps to IncidentEvent.eventId.';

COMMENT ON COLUMN incidents.incident_events.status IS
  'Processing state used by IncidentEventRepository.';

COMMENT ON COLUMN incidents.incident_events.processed_at IS
  'Timestamp when the event completed processing.';

COMMENT ON COLUMN incidents.incident_events.processing_time_ms IS
  'Measured event processing duration in milliseconds.';