-- ============================================================================
-- AIRA PHASE 13.4B
-- MIGRATION 0008 — SIGNAL + CORRELATION + TOPOLOGY PARITY
-- ============================================================================


-- ============================================================================
-- SIGNAL PARITY
-- ============================================================================

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS monitor_id TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS integration_connection_id TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS source_event_id TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS trace_id TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS span_id TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS parent_span_id TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS error_code TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS status_code INTEGER;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS metric JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS labels JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS annotations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS correlated_signal_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS normalized_at TIMESTAMPTZ;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS raw_payload JSONB;

ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

/*
 * Complete application-level aggregate.
 *
 * PostgreSQL columns remain authoritative for indexed/queryable state.
 * document preserves compatibility with the current Signal domain shape.
 */
ALTER TABLE signals.signals
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_signals_database_id_unique
ON signals.signals (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_signals_service_observed
ON signals.signals (
  organization_id,
  environment_id,
  service_id,
  observed_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_signals_severity_status
ON signals.signals (
  organization_id,
  environment_id,
  severity,
  processing_status,
  observed_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_signals_provider_event
ON signals.signals (
  organization_id,
  environment_id,
  provider,
  event_type,
  observed_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_signals_trace
ON signals.signals (
  organization_id,
  environment_id,
  trace_id
);


CREATE INDEX IF NOT EXISTS
  idx_signals_document_gin
ON signals.signals
USING GIN (
  document
);


/*
 * Provider-side event identity.
 *
 * Mirrors the Mongo uniqueness contract:
 *
 * organization + environment + provider +
 * integrationConnectionId + sourceEventId
 */
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_signals_provider_source_event_unique
ON signals.signals (
  organization_id,
  environment_id,
  provider,
  integration_connection_id,
  source_event_id
)
WHERE
  integration_connection_id IS NOT NULL
  AND source_event_id IS NOT NULL;


-- ============================================================================
-- SIGNAL CORRELATION GROUP PARITY
-- ============================================================================

ALTER TABLE signals.correlation_groups
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE signals.correlation_groups
ADD COLUMN IF NOT EXISTS incident_id UUID
  REFERENCES incidents.incidents(id)
  ON DELETE SET NULL;

ALTER TABLE signals.correlation_groups
ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ;

ALTER TABLE signals.correlation_groups
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE signals.correlation_groups
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_correlation_groups_database_id_unique
ON signals.correlation_groups (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_correlation_groups_status_latest
ON signals.correlation_groups (
  organization_id,
  environment_id,
  status,
  last_observed_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_correlation_groups_service_candidate
ON signals.correlation_groups (
  organization_id,
  environment_id,
  service_id,
  incident_candidate
);


CREATE INDEX IF NOT EXISTS
  idx_correlation_groups_document_gin
ON signals.correlation_groups
USING GIN (
  document
);


-- ============================================================================
-- SERVICE DEPENDENCIES
-- ============================================================================
--
-- The generic resources.resource_relationships schema is future-facing and
-- UUID-resource based.
--
-- Current signal correlation still operates on Service model identifiers.
-- Preserve that behavior explicitly until the resource graph migration later.
-- ============================================================================

CREATE TABLE IF NOT EXISTS resources.service_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  database_id TEXT,

  tenant_public_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  source_service_id TEXT NOT NULL,
  target_service_id TEXT NOT NULL,

  dependency_type TEXT NOT NULL DEFAULT 'critical',

  criticality INTEGER NOT NULL DEFAULT 5,

  user_facing BOOLEAN NOT NULL DEFAULT FALSE,

  sla JSONB NOT NULL DEFAULT '{}'::jsonb,

  latency_ms NUMERIC NOT NULL DEFAULT 0,

  failure_rate NUMERIC(8,7) NOT NULL DEFAULT 0,

  discovery_method TEXT NOT NULL DEFAULT 'manual',

  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

  confidence NUMERIC(5,4) NOT NULL DEFAULT 1,

  active BOOLEAN NOT NULL DEFAULT TRUE,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT service_dependency_no_self_reference
    CHECK (
      source_service_id <>
      target_service_id
    ),

  CONSTRAINT service_dependency_criticality_range
    CHECK (
      criticality >= 1
      AND criticality <= 10
    ),

  CONSTRAINT service_dependency_failure_rate_range
    CHECK (
      failure_rate >= 0
      AND failure_rate <= 1
    ),

  CONSTRAINT service_dependency_confidence_range
    CHECK (
      confidence >= 0
      AND confidence <= 1
    ),

  CONSTRAINT service_dependency_scope_unique
    UNIQUE (
      organization_id,
      environment_id,
      source_service_id,
      target_service_id
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_service_dependencies_database_id_unique
ON resources.service_dependencies (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_service_dependencies_source_active
ON resources.service_dependencies (
  organization_id,
  environment_id,
  source_service_id,
  active
);


CREATE INDEX IF NOT EXISTS
  idx_service_dependencies_target_active
ON resources.service_dependencies (
  organization_id,
  environment_id,
  target_service_id,
  active
);


-- ============================================================================
-- CORRELATION RESOURCE RELATIONSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS resources.correlation_resource_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  database_id TEXT,

  tenant_public_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,

  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  relationship_type TEXT NOT NULL,

  confidence NUMERIC(5,4) NOT NULL DEFAULT 1,

  discovery_method TEXT NOT NULL DEFAULT 'manual',

  integration_id TEXT,

  source_relationship_model TEXT,
  source_relationship_id TEXT,

  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

  last_seen_sync_id TEXT,

  observation_count INTEGER NOT NULL DEFAULT 1,

  criticality INTEGER NOT NULL DEFAULT 5,

  user_facing BOOLEAN NOT NULL DEFAULT FALSE,

  propagates_failure BOOLEAN NOT NULL DEFAULT TRUE,

  active BOOLEAN NOT NULL DEFAULT TRUE,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  inactive_since TIMESTAMPTZ,

  recovered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT correlation_relationship_no_self_reference
    CHECK (
      source_type <> target_type
      OR source_id <> target_id
    ),

  CONSTRAINT correlation_relationship_confidence_range
    CHECK (
      confidence >= 0
      AND confidence <= 1
    ),

  CONSTRAINT correlation_relationship_observation_nonnegative
    CHECK (
      observation_count >= 0
    ),

  CONSTRAINT correlation_relationship_criticality_range
    CHECK (
      criticality >= 1
      AND criticality <= 10
    ),

  CONSTRAINT correlation_relationship_scope_unique
    UNIQUE (
      organization_id,
      environment_id,
      source_type,
      source_id,
      target_type,
      target_id,
      relationship_type
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_correlation_relationship_database_id_unique
ON resources.correlation_resource_relationships (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_correlation_relationship_source
ON resources.correlation_resource_relationships (
  organization_id,
  environment_id,
  source_type,
  source_id,
  active
);


CREATE INDEX IF NOT EXISTS
  idx_correlation_relationship_target
ON resources.correlation_resource_relationships (
  organization_id,
  environment_id,
  target_type,
  target_id,
  active
);


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS
  trg_service_dependencies_updated_at
ON resources.service_dependencies;

CREATE TRIGGER
  trg_service_dependencies_updated_at
BEFORE UPDATE
ON resources.service_dependencies
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_correlation_relationships_updated_at
ON resources.correlation_resource_relationships;

CREATE TRIGGER
  trg_correlation_relationships_updated_at
BEFORE UPDATE
ON resources.correlation_resource_relationships
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE resources.service_dependencies
ENABLE ROW LEVEL SECURITY;

ALTER TABLE resources.service_dependencies
FORCE ROW LEVEL SECURITY;


CREATE POLICY service_dependencies_scope_policy
ON resources.service_dependencies
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);


ALTER TABLE resources.correlation_resource_relationships
ENABLE ROW LEVEL SECURITY;

ALTER TABLE resources.correlation_resource_relationships
FORCE ROW LEVEL SECURITY;


CREATE POLICY correlation_resource_relationship_scope_policy
ON resources.correlation_resource_relationships
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);


CREATE TRIGGER
  trg_service_dependencies_scope_integrity
BEFORE INSERT OR UPDATE
ON resources.service_dependencies
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();


CREATE TRIGGER
  trg_correlation_relationship_scope_integrity
BEFORE INSERT OR UPDATE
ON resources.correlation_resource_relationships
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();