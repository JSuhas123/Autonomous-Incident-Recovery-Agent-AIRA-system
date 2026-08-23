-- ============================================================================
-- AIRA PHASE 13
-- MIGRATION 0017 — RECOVERY VERIFICATION PERSISTENCE
-- ============================================================================
--
-- Canonical PostgreSQL ownership for:
--
-- - RecoveryVerification
-- - RecoveryVerificationRun
--
-- This migration intentionally stores:
--
-- - canonical searchable columns
-- - provider-neutral public/database identifiers
-- - the complete domain document as JSONB
--
-- The JSONB document preserves forward compatibility while Phase 13 removes
-- the remaining MongoDB runtime dependency.
-- ============================================================================


-- ============================================================================
-- RECOVERY VERIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.recovery_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  database_id TEXT,

  legacy_mongo_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID NOT NULL
    REFERENCES incidents.incidents(id)
    ON DELETE CASCADE,

  incident_public_id TEXT,

  execution_request_public_id TEXT NOT NULL,

  authorization_public_id TEXT,

  recovery_decision_public_id TEXT,

  execution_plan_id TEXT,

  execution_plan_hash TEXT,

  verification_plan_id TEXT NOT NULL,

  verification_plan_hash TEXT NOT NULL,

  revision INTEGER NOT NULL,

  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  status TEXT NOT NULL DEFAULT 'current',

  decision TEXT NOT NULL,

  confidence TEXT,

  next_action TEXT,

  recovered BOOLEAN NOT NULL DEFAULT FALSE,

  recovery_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

  incident_closure_eligible BOOLEAN NOT NULL DEFAULT FALSE,

  overall_score DOUBLE PRECISION,

  verification_plan JSONB NOT NULL DEFAULT '{}'::jsonb,

  evidence_package JSONB NOT NULL DEFAULT '{}'::jsonb,

  decision_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  critic_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  routing_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  previous_verification_id UUID
    REFERENCES execution.recovery_verifications(id)
    ON DELETE SET NULL,

  superseded_by_verification_id UUID
    REFERENCES execution.recovery_verifications(id)
    ON DELETE SET NULL,

  verified_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  document JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recovery_verification_revision_positive
    CHECK (
      revision >= 1
    ),

  CONSTRAINT recovery_verification_score_range
    CHECK (
      overall_score IS NULL
      OR (
        overall_score >= 0
        AND overall_score <= 1
      )
    ),

  CONSTRAINT recovery_verification_status_valid
    CHECK (
      status IN (
        'current',
        'superseded'
      )
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_public_unique
ON execution.recovery_verifications (
  public_id
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_database_unique
ON execution.recovery_verifications (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_legacy_unique
ON execution.recovery_verifications (
  legacy_mongo_id
)
WHERE legacy_mongo_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_revision_unique
ON execution.recovery_verifications (
  organization_id,
  environment_id,
  incident_id,
  revision
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_current_unique
ON execution.recovery_verifications (
  organization_id,
  environment_id,
  incident_id
)
WHERE is_current = TRUE;


CREATE INDEX IF NOT EXISTS
  idx_recovery_verification_incident_history
ON execution.recovery_verifications (
  organization_id,
  environment_id,
  incident_id,
  revision DESC
);


CREATE INDEX IF NOT EXISTS
  idx_recovery_verification_execution_request
ON execution.recovery_verifications (
  organization_id,
  environment_id,
  execution_request_public_id
);


CREATE INDEX IF NOT EXISTS
  idx_recovery_verification_document_gin
ON execution.recovery_verifications
USING GIN (
  document
);


-- ============================================================================
-- RECOVERY VERIFICATION RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.recovery_verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  database_id TEXT,

  legacy_mongo_id TEXT,

  verification_public_id TEXT NOT NULL,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID NOT NULL
    REFERENCES incidents.incidents(id)
    ON DELETE CASCADE,

  incident_public_id TEXT,

  execution_request_public_id TEXT NOT NULL,

  state TEXT NOT NULL,

  attempt INTEGER NOT NULL DEFAULT 0,

  max_attempts INTEGER NOT NULL DEFAULT 1,

  verification_plan_id TEXT,

  verification_plan_hash TEXT,

  result_verification_id UUID
    REFERENCES execution.recovery_verifications(id)
    ON DELETE SET NULL,

  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  started_at TIMESTAMPTZ,

  completed_at TIMESTAMPTZ,

  failure JSONB,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  document JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recovery_verification_run_state_valid
    CHECK (
      state IN (
        'CREATED',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'CANCELLED'
      )
    ),

  CONSTRAINT recovery_verification_run_attempt_valid
    CHECK (
      attempt >= 0
    ),

  CONSTRAINT recovery_verification_run_max_attempt_valid
    CHECK (
      max_attempts >= 1
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_run_public_unique
ON execution.recovery_verification_runs (
  public_id
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_run_database_unique
ON execution.recovery_verification_runs (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_verification_run_legacy_unique
ON execution.recovery_verification_runs (
  legacy_mongo_id
)
WHERE legacy_mongo_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_recovery_verification_run_incident
ON execution.recovery_verification_runs (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_recovery_verification_run_execution_request
ON execution.recovery_verification_runs (
  organization_id,
  environment_id,
  execution_request_public_id
);


CREATE INDEX IF NOT EXISTS
  idx_recovery_verification_run_document_gin
ON execution.recovery_verification_runs
USING GIN (
  document
);


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE execution.recovery_verifications
  ENABLE ROW LEVEL SECURITY;


ALTER TABLE execution.recovery_verification_runs
  ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
  recovery_verifications_scope_policy
ON execution.recovery_verifications;


CREATE POLICY recovery_verifications_scope_policy
ON execution.recovery_verifications
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


DROP POLICY IF EXISTS
  recovery_verification_runs_scope_policy
ON execution.recovery_verification_runs;


CREATE POLICY recovery_verification_runs_scope_policy
ON execution.recovery_verification_runs
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