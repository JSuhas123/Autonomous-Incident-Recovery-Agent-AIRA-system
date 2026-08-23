-- ============================================================================
-- AIRA PHASE 13.4A
-- MIGRATION 0007 — INCIDENT CORE REPOSITORY PARITY
-- ============================================================================

-- ============================================================================
-- INCIDENT AGGREGATE PARITY
-- ============================================================================

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS monitor_id TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS source_event_id TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS detection_method TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS correlation_group_id TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS primary_signal_id TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS signal_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS signal_fingerprint TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS providers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS provider_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS evidence_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS correlation_confidence NUMERIC(5,4);

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS impact TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS last_signal_at TIMESTAMPTZ;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS last_reopened_at TIMESTAMPTZ;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS resolution TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS resolution_type TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS analysis_status TEXT;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS analysis_started_at TIMESTAMPTZ;

ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMPTZ;

/*
 * Full aggregate snapshot.
 *
 * PostgreSQL columns own queryable/relational fields while document retains
 * the complete current AIRA Incident aggregate during Mongo migration.
 */
ALTER TABLE incidents.incidents
  ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


-- ============================================================================
-- INCIDENT EVENT PARITY
-- ============================================================================

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS tenant_public_id TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS service_id TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS monitor_id TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS correlation_group_id TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS signal_id TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS incident_status TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS severity TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS issue TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS new_status TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS change_type TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4);

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS suggested_action TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS action_tier TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS error TEXT;

ALTER TABLE incidents.incident_events
  ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


-- ============================================================================
-- INCIDENT LIFECYCLE TRANSITION HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents.incident_lifecycle_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID NOT NULL
    REFERENCES incidents.incidents(id)
    ON DELETE CASCADE,

  revision INTEGER NOT NULL,

  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,

  reason TEXT,

  actor JSONB NOT NULL DEFAULT '{}'::jsonb,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,

  verification_id TEXT,
  recovery_decision_id TEXT,
  execution_request_id TEXT,
  retry_request_id TEXT,
  rollback_request_id TEXT,
  escalation_id TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  transitioned_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lifecycle_transition_public_unique
    UNIQUE (public_id),

  CONSTRAINT lifecycle_transition_revision_positive
    CHECK (revision >= 1),

  CONSTRAINT lifecycle_transition_revision_unique
    UNIQUE (
      organization_id,
      environment_id,
      incident_id,
      revision
    )
);


-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incidents_occurrence_count_nonnegative'
      AND conrelid = 'incidents.incidents'::regclass
  ) THEN
    ALTER TABLE incidents.incidents
      ADD CONSTRAINT incidents_occurrence_count_nonnegative
      CHECK (occurrence_count >= 0);
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incidents_provider_count_nonnegative'
      AND conrelid = 'incidents.incidents'::regclass
  ) THEN
    ALTER TABLE incidents.incidents
      ADD CONSTRAINT incidents_provider_count_nonnegative
      CHECK (provider_count >= 0);
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incidents_evidence_count_nonnegative'
      AND conrelid = 'incidents.incidents'::regclass
  ) THEN
    ALTER TABLE incidents.incidents
      ADD CONSTRAINT incidents_evidence_count_nonnegative
      CHECK (evidence_count >= 0);
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incidents_correlation_confidence_range'
      AND conrelid = 'incidents.incidents'::regclass
  ) THEN
    ALTER TABLE incidents.incidents
      ADD CONSTRAINT incidents_correlation_confidence_range
      CHECK (
        correlation_confidence IS NULL
        OR (
          correlation_confidence >= 0
          AND correlation_confidence <= 1
        )
      );
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incident_events_confidence_range'
      AND conrelid = 'incidents.incident_events'::regclass
  ) THEN
    ALTER TABLE incidents.incident_events
      ADD CONSTRAINT incident_events_confidence_range
      CHECK (
        confidence_score IS NULL
        OR (
          confidence_score >= 0
          AND confidence_score <= 1
        )
      );
  END IF;
END
$$;


-- ============================================================================
-- INCIDENT CONCURRENCY / QUERY INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_incidents_unique_active_fingerprint
ON incidents.incidents (
  organization_id,
  environment_id,
  fingerprint
)
WHERE
  fingerprint IS NOT NULL
  AND status IN (
    'open',
    'acknowledged',
    'investigating',
    'recovering'
  );


CREATE INDEX IF NOT EXISTS
  idx_incidents_service_status
ON incidents.incidents (
  organization_id,
  environment_id,
  service_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_incidents_monitor_status
ON incidents.incidents (
  organization_id,
  environment_id,
  monitor_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_incidents_correlation_status
ON incidents.incidents (
  organization_id,
  environment_id,
  correlation_group_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_incidents_signal_fingerprint_status
ON incidents.incidents (
  organization_id,
  environment_id,
  signal_fingerprint,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_incidents_document_gin
ON incidents.incidents
USING GIN (document);


CREATE INDEX IF NOT EXISTS
  idx_incident_events_correlation
ON incidents.incident_events (
  organization_id,
  environment_id,
  correlation_id,
  occurred_at
);


CREATE INDEX IF NOT EXISTS
  idx_incident_lifecycle_transition_history
ON incidents.incident_lifecycle_transitions (
  organization_id,
  environment_id,
  incident_id,
  revision ASC
);


-- ============================================================================
-- IMMUTABLE LIFECYCLE HISTORY
-- ============================================================================

CREATE OR REPLACE FUNCTION incidents.prevent_lifecycle_transition_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AIRA incident lifecycle transitions are immutable';
END;
$$;


DROP TRIGGER IF EXISTS
  trg_lifecycle_transition_immutable_update
ON incidents.incident_lifecycle_transitions;

CREATE TRIGGER
  trg_lifecycle_transition_immutable_update
BEFORE UPDATE
ON incidents.incident_lifecycle_transitions
FOR EACH ROW
EXECUTE FUNCTION
  incidents.prevent_lifecycle_transition_mutation();


DROP TRIGGER IF EXISTS
  trg_lifecycle_transition_immutable_delete
ON incidents.incident_lifecycle_transitions;

CREATE TRIGGER
  trg_lifecycle_transition_immutable_delete
BEFORE DELETE
ON incidents.incident_lifecycle_transitions
FOR EACH ROW
EXECUTE FUNCTION
  incidents.prevent_lifecycle_transition_mutation();


-- ============================================================================
-- RLS FOR NEW TRANSITION TABLE
-- ============================================================================

ALTER TABLE incidents.incident_lifecycle_transitions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE incidents.incident_lifecycle_transitions
  FORCE ROW LEVEL SECURITY;


CREATE POLICY lifecycle_transition_scope_policy
ON incidents.incident_lifecycle_transitions
USING (
  organization_id = tenancy.current_organization_id()
  AND
  environment_id = tenancy.current_environment_id()
)
WITH CHECK (
  organization_id = tenancy.current_organization_id()
  AND
  environment_id = tenancy.current_environment_id()
);


CREATE TRIGGER
  trg_lifecycle_transition_scope_integrity
BEFORE INSERT
ON incidents.incident_lifecycle_transitions
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();