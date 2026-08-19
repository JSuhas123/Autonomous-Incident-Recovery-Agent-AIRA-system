-- ============================================================================
-- AIRA PHASE 13.3
-- MIGRATION 0002 — INCIDENTS + SIGNALS
-- ============================================================================

-- ============================================================================
-- INCIDENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  tenant_public_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  service_id TEXT,

  correlation_id TEXT,

  title TEXT,
  description TEXT,

  status TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'unknown',

  source TEXT,
  provider TEXT,

  incident_candidate BOOLEAN NOT NULL DEFAULT FALSE,

  first_detected_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,

  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT incidents_public_id_unique
    UNIQUE (public_id),

  CONSTRAINT incidents_legacy_mongo_id_unique
    UNIQUE (legacy_mongo_id)
);

CREATE INDEX IF NOT EXISTS
  idx_incidents_scope_status
ON incidents.incidents (
  organization_id,
  environment_id,
  status,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_incidents_scope_severity
ON incidents.incidents (
  organization_id,
  environment_id,
  severity,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_incidents_correlation
ON incidents.incidents (
  organization_id,
  environment_id,
  correlation_id
);

CREATE INDEX IF NOT EXISTS
  idx_incidents_service
ON incidents.incidents (
  organization_id,
  environment_id,
  service_id,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_incidents_metadata_gin
ON incidents.incidents
USING GIN (
  metadata
);

-- ============================================================================
-- INCIDENT EVENTS — APPEND ONLY
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents.incident_events (
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

  event_type TEXT NOT NULL,
  source TEXT,

  actor_type TEXT,
  actor_id TEXT,

  correlation_id TEXT,

  sequence_number BIGINT,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT incident_events_public_id_unique
    UNIQUE (public_id)
);

CREATE INDEX IF NOT EXISTS
  idx_incident_events_timeline
ON incidents.incident_events (
  organization_id,
  environment_id,
  incident_id,
  occurred_at ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_incident_events_sequence_unique
ON incidents.incident_events (
  incident_id,
  sequence_number
)
WHERE sequence_number IS NOT NULL;

-- ============================================================================
-- INCIDENT LIFECYCLE SNAPSHOT
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents.incident_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID NOT NULL
    REFERENCES incidents.incidents(id)
    ON DELETE CASCADE,

  lifecycle_state TEXT NOT NULL,

  revision INTEGER NOT NULL DEFAULT 1,

  verification_id TEXT,
  recovery_decision_id TEXT,
  execution_request_id TEXT,
  retry_request_id TEXT,
  rollback_request_id TEXT,
  escalation_id TEXT,

  stability_observation JSONB,
  closure_eligibility JSONB,
  latest_transition JSONB,

  last_reason TEXT,

  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  regressed_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT incident_lifecycle_incident_unique
    UNIQUE (
      organization_id,
      environment_id,
      incident_id
    ),

  CONSTRAINT incident_lifecycle_revision_positive
    CHECK (
      revision >= 1
    )
);

-- ============================================================================
-- SIGNALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  tenant_public_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID
    REFERENCES incidents.incidents(id)
    ON DELETE SET NULL,

  service_id TEXT,

  provider TEXT NOT NULL,
  source TEXT,

  signal_type TEXT NOT NULL,
  event_type TEXT,

  severity TEXT NOT NULL DEFAULT 'unknown',

  fingerprint TEXT,

  provider_event_id TEXT,

  correlation_id TEXT,
  correlation_group_id TEXT,

  correlation_score NUMERIC(5,4),

  incident_candidate BOOLEAN NOT NULL DEFAULT FALSE,

  processing_status TEXT NOT NULL DEFAULT 'received',
  processing_error TEXT,

  duplicate_count INTEGER NOT NULL DEFAULT 0,

  resource JSONB NOT NULL DEFAULT '{}'::jsonb,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL,

  enriched_at TIMESTAMPTZ,
  correlated_at TIMESTAMPTZ,
  routed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT signals_public_id_unique
    UNIQUE (public_id),

  CONSTRAINT signals_legacy_mongo_id_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT signals_correlation_score_range
    CHECK (
      correlation_score IS NULL OR
      (
        correlation_score >= 0 AND
        correlation_score <= 1
      )
    ),

  CONSTRAINT signals_duplicate_count_nonnegative
    CHECK (
      duplicate_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS
  idx_signals_scope_observed
ON signals.signals (
  organization_id,
  environment_id,
  observed_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_signals_scope_status
ON signals.signals (
  organization_id,
  environment_id,
  processing_status,
  observed_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_signals_fingerprint
ON signals.signals (
  organization_id,
  environment_id,
  fingerprint,
  last_seen_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_signals_correlation_group
ON signals.signals (
  organization_id,
  environment_id,
  correlation_group_id,
  observed_at
);

CREATE INDEX IF NOT EXISTS
  idx_signals_incident_candidate
ON signals.signals (
  organization_id,
  environment_id,
  incident_candidate,
  observed_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_signals_attributes_gin
ON signals.signals
USING GIN (
  attributes
);

-- ============================================================================
-- SIGNAL CORRELATION GROUPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals.correlation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  tenant_public_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  primary_signal_id TEXT,

  service_id TEXT,

  status TEXT NOT NULL DEFAULT 'forming',

  providers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  signal_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  signal_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  highest_severity TEXT NOT NULL DEFAULT 'unknown',

  confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,

  incident_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  incident_candidate_reason TEXT,

  signal_count INTEGER NOT NULL DEFAULT 0,
  provider_count INTEGER NOT NULL DEFAULT 0,

  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  first_observed_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT correlation_groups_public_unique
    UNIQUE (
      organization_id,
      environment_id,
      public_id
    ),

  CONSTRAINT correlation_groups_confidence_range
    CHECK (
      confidence_score >= 0 AND
      confidence_score <= 1
    )
);

CREATE INDEX IF NOT EXISTS
  idx_correlation_groups_candidate
ON signals.correlation_groups (
  organization_id,
  environment_id,
  incident_candidate,
  last_observed_at DESC
);

-- ============================================================================
-- UPDATED_AT
-- ============================================================================

CREATE TRIGGER
  trg_incidents_updated_at
BEFORE UPDATE
ON incidents.incidents
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();

CREATE TRIGGER
  trg_incident_lifecycle_updated_at
BEFORE UPDATE
ON incidents.incident_lifecycle
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();

CREATE TRIGGER
  trg_signals_updated_at
BEFORE UPDATE
ON signals.signals
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();

CREATE TRIGGER
  trg_correlation_groups_updated_at
BEFORE UPDATE
ON signals.correlation_groups
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();