-- ============================================================================
-- AIRA PHASE 13.3
-- MIGRATION 0003 — INTELLIGENCE + RECOVERY + EXECUTION
-- ============================================================================


-- ============================================================================
-- AGENT INTELLIGENCE RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents.intelligence_runs (
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

  incident_id UUID NOT NULL
    REFERENCES incidents.incidents(id)
    ON DELETE CASCADE,

  /*
   * Circular relationship with incidents.diagnoses.
   *
   * The column is created here without the FK.
   * The FK is added after incidents.diagnoses exists.
   */
  diagnosis_id UUID,

  status TEXT NOT NULL,

  confidence NUMERIC(5,4),

  execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnosis_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  agent_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  stage_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_state JSONB NOT NULL DEFAULT '{}'::jsonb,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT intelligence_runs_public_unique
    UNIQUE (public_id),

  CONSTRAINT intelligence_runs_legacy_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT intelligence_runs_confidence_range
    CHECK (
      confidence IS NULL
      OR (
        confidence >= 0
        AND confidence <= 1
      )
    ),

  /*
   * Intelligence persistence must never grant execution authority.
   */
  CONSTRAINT intelligence_runs_never_authorize_execution
    CHECK (
      execution_authorized = FALSE
    )
);


CREATE INDEX IF NOT EXISTS
  idx_intelligence_runs_incident_latest
ON agents.intelligence_runs (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_intelligence_runs_status
ON agents.intelligence_runs (
  organization_id,
  environment_id,
  status,
  created_at DESC
);


-- ============================================================================
-- INCIDENT DIAGNOSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
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

  intelligence_run_id UUID
    REFERENCES agents.intelligence_runs(id)
    ON DELETE SET NULL,

  revision INTEGER NOT NULL,

  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  status TEXT NOT NULL,

  confidence NUMERIC(5,4),

  symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  hypotheses JSONB NOT NULL DEFAULT '[]'::jsonb,

  root_cause JSONB,
  impact_snapshot JSONB,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,

  previous_diagnosis_id UUID
    REFERENCES incidents.diagnoses(id)
    ON DELETE SET NULL,

  superseded_by_diagnosis_id UUID
    REFERENCES incidents.diagnoses(id)
    ON DELETE SET NULL,

  execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT diagnoses_public_unique
    UNIQUE (public_id),

  CONSTRAINT diagnoses_legacy_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT diagnoses_revision_positive
    CHECK (
      revision >= 1
    ),

  CONSTRAINT diagnoses_confidence_range
    CHECK (
      confidence IS NULL
      OR (
        confidence >= 0
        AND confidence <= 1
      )
    ),

  /*
   * Diagnosis is evidence/reasoning only.
   * It can never authorize infrastructure execution.
   */
  CONSTRAINT diagnoses_never_authorize_execution
    CHECK (
      execution_authorized = FALSE
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_diagnoses_revision_unique
ON incidents.diagnoses (
  incident_id,
  revision
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_diagnoses_one_current
ON incidents.diagnoses (
  incident_id
)
WHERE is_current = TRUE;


CREATE INDEX IF NOT EXISTS
  idx_diagnoses_scope_status
ON incidents.diagnoses (
  organization_id,
  environment_id,
  status,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_diagnoses_incident_latest
ON incidents.diagnoses (
  organization_id,
  environment_id,
  incident_id,
  revision DESC
);


-- ============================================================================
-- COMPLETE INTELLIGENCE RUN ↔ DIAGNOSIS RELATIONSHIP
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intelligence_runs_diagnosis_fk'
      AND conrelid = 'agents.intelligence_runs'::regclass
  ) THEN
    ALTER TABLE agents.intelligence_runs
      ADD CONSTRAINT intelligence_runs_diagnosis_fk
      FOREIGN KEY (diagnosis_id)
      REFERENCES incidents.diagnoses(id)
      ON DELETE SET NULL;
  END IF;
END
$$;


-- ============================================================================
-- RECOVERY DECISION RUNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.recovery_decision_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
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

  diagnosis_id UUID
    REFERENCES incidents.diagnoses(id)
    ON DELETE SET NULL,

  diagnosis_revision INTEGER,

  /*
   * Circular relationship with recovery_decisions.
   *
   * The FK is added after recovery_decisions exists.
   */
  decision_id UUID,

  status TEXT NOT NULL,

  decision_type TEXT,

  selected_candidate_id TEXT,
  selected_playbook_id TEXT,

  confidence NUMERIC(5,4),

  stage_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  critic_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  duration_ms BIGINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recovery_runs_public_unique
    UNIQUE (public_id),

  CONSTRAINT recovery_runs_legacy_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT recovery_runs_confidence_range
    CHECK (
      confidence IS NULL
      OR (
        confidence >= 0
        AND confidence <= 1
      )
    ),

  CONSTRAINT recovery_runs_duration_nonnegative
    CHECK (
      duration_ms IS NULL
      OR duration_ms >= 0
    ),

  CONSTRAINT recovery_runs_never_authorize_execution
    CHECK (
      execution_authorized = FALSE
    )
);


CREATE INDEX IF NOT EXISTS
  idx_recovery_runs_incident_latest
ON execution.recovery_decision_runs (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_recovery_runs_status
ON execution.recovery_decision_runs (
  organization_id,
  environment_id,
  status,
  created_at DESC
);


-- ============================================================================
-- RECOVERY DECISIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.recovery_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
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

  diagnosis_id UUID
    REFERENCES incidents.diagnoses(id)
    ON DELETE SET NULL,

  run_id UUID
    REFERENCES execution.recovery_decision_runs(id)
    ON DELETE SET NULL,

  revision INTEGER NOT NULL,

  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  status TEXT NOT NULL,
  decision TEXT NOT NULL,

  selected_candidate_id TEXT,
  selected_playbook_id TEXT,

  confidence NUMERIC(5,4),

  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  rejected_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,

  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  unknowns JSONB NOT NULL DEFAULT '[]'::jsonb,

  policy_status TEXT,
  risk_level TEXT,

  approval_required BOOLEAN,
  approval_mode TEXT,

  rollback_available BOOLEAN,
  reversibility TEXT,

  critic_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  supersedes_decision_id UUID
    REFERENCES execution.recovery_decisions(id)
    ON DELETE SET NULL,

  superseded_by_decision_id UUID
    REFERENCES execution.recovery_decisions(id)
    ON DELETE SET NULL,

  execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

  generated_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recovery_decisions_public_unique
    UNIQUE (public_id),

  CONSTRAINT recovery_decisions_legacy_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT recovery_decisions_revision_positive
    CHECK (
      revision >= 1
    ),

  CONSTRAINT recovery_decisions_confidence_range
    CHECK (
      confidence IS NULL
      OR (
        confidence >= 0
        AND confidence <= 1
      )
    ),

  /*
   * Recovery recommendation itself is not execution authorization.
   */
  CONSTRAINT recovery_decisions_never_authorize_execution
    CHECK (
      execution_authorized = FALSE
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_decision_revision
ON execution.recovery_decisions (
  incident_id,
  revision
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_decision_current
ON execution.recovery_decisions (
  incident_id
)
WHERE is_current = TRUE;


CREATE INDEX IF NOT EXISTS
  idx_recovery_decisions_scope_status
ON execution.recovery_decisions (
  organization_id,
  environment_id,
  status,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_recovery_decisions_incident_latest
ON execution.recovery_decisions (
  organization_id,
  environment_id,
  incident_id,
  revision DESC
);


-- ============================================================================
-- COMPLETE RECOVERY RUN ↔ DECISION RELATIONSHIP
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recovery_decision_runs_decision_fk'
      AND conrelid = 'execution.recovery_decision_runs'::regclass
  ) THEN
    ALTER TABLE execution.recovery_decision_runs
      ADD CONSTRAINT recovery_decision_runs_decision_fk
      FOREIGN KEY (decision_id)
      REFERENCES execution.recovery_decisions(id)
      ON DELETE SET NULL;
  END IF;
END
$$;


-- ============================================================================
-- EXECUTION AUTHORIZATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
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

  recovery_decision_id UUID NOT NULL
    REFERENCES execution.recovery_decisions(id)
    ON DELETE RESTRICT,

  recovery_decision_revision INTEGER,

  selected_candidate_id TEXT,
  selected_playbook_id TEXT,

  decision TEXT NOT NULL,
  status TEXT NOT NULL,

  authorization_granted BOOLEAN NOT NULL DEFAULT FALSE,

  approval_state JSONB,
  policy_state JSONB,
  freshness_state JSONB,
  kill_switch_state JSONB,
  lock_state JSONB,
  idempotency_state JSONB,

  valid_from TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  authorized_at TIMESTAMPTZ,

  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,

  execution_plan JSONB,

  plan_id TEXT,
  plan_hash TEXT,

  idempotency_key TEXT,
  lease_key TEXT,
  lease_owner_id TEXT,

  stage_trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  critic_result JSONB NOT NULL DEFAULT '{}'::jsonb,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT execution_authorizations_public_unique
    UNIQUE (public_id),

  CONSTRAINT execution_authorizations_legacy_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT execution_authorization_time_valid
    CHECK (
      valid_from IS NULL
      OR expires_at IS NULL
      OR expires_at >= valid_from
    )
);


CREATE INDEX IF NOT EXISTS
  idx_execution_authorizations_incident
ON execution.authorizations (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_execution_authorizations_decision
ON execution.authorizations (
  organization_id,
  environment_id,
  recovery_decision_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_execution_authorizations_idempotency
ON execution.authorizations (
  organization_id,
  environment_id,
  idempotency_key
)
WHERE idempotency_key IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_execution_authorizations_expiry
ON execution.authorizations (
  organization_id,
  environment_id,
  expires_at
)
WHERE authorization_granted = TRUE;


-- ============================================================================
-- EXECUTION REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.execution_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
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

  authorization_id UUID NOT NULL
    REFERENCES execution.authorizations(id)
    ON DELETE RESTRICT,

  recovery_decision_id UUID
    REFERENCES execution.recovery_decisions(id)
    ON DELETE SET NULL,

  recovery_decision_revision INTEGER,

  candidate_id TEXT,
  playbook_id TEXT,

  state TEXT NOT NULL,

  plan_id TEXT,
  plan_hash TEXT,

  execution_plan JSONB NOT NULL DEFAULT '{}'::jsonb,

  idempotency_key TEXT,

  lock_key TEXT,
  lease_owner_id TEXT,

  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,

  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  result JSONB,
  failure JSONB,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT execution_requests_public_unique
    UNIQUE (public_id),

  CONSTRAINT execution_requests_legacy_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT execution_requests_attempt_nonnegative
    CHECK (
      attempt >= 0
    ),

  CONSTRAINT execution_requests_max_attempts_positive
    CHECK (
      max_attempts >= 1
    ),

  CONSTRAINT execution_requests_attempt_limit
    CHECK (
      attempt <= max_attempts
    ),

  CONSTRAINT execution_requests_time_order
    CHECK (
      started_at IS NULL
      OR completed_at IS NULL
      OR completed_at >= started_at
    )
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_execution_requests_idempotency_unique
ON execution.execution_requests (
  organization_id,
  environment_id,
  idempotency_key
)
WHERE idempotency_key IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_execution_requests_state
ON execution.execution_requests (
  organization_id,
  environment_id,
  state,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_execution_requests_incident
ON execution.execution_requests (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_execution_requests_authorization
ON execution.execution_requests (
  authorization_id
);


CREATE INDEX IF NOT EXISTS
  idx_execution_requests_recovery_decision
ON execution.execution_requests (
  recovery_decision_id
);


-- ============================================================================
-- RUNTIME RECOVERY CHECKPOINTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow.runtime_recovery_checkpoints (
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

  operation_key TEXT NOT NULL,

  stage TEXT NOT NULL,
  status TEXT NOT NULL,

  workflow_identity JSONB NOT NULL DEFAULT '{}'::jsonb,

  owner_worker_id TEXT,
  owner_claim_token TEXT,

  owner_claimed_at TIMESTAMPTZ,
  owner_heartbeat_at TIMESTAMPTZ,
  owner_lease_expires_at TIMESTAMPTZ,

  attempt INTEGER NOT NULL DEFAULT 0,

  interrupted BOOLEAN NOT NULL DEFAULT FALSE,

  interruption_reason TEXT,
  interruption_detected_at TIMESTAMPTZ,

  resume_safety TEXT NOT NULL DEFAULT 'unknown',

  result JSONB,

  error_code TEXT,
  error_message TEXT,
  error_retryable BOOLEAN NOT NULL DEFAULT FALSE,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  last_transition_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT runtime_checkpoint_identity_unique
    UNIQUE (
      organization_id,
      environment_id,
      incident_id,
      stage,
      operation_key
    ),

  CONSTRAINT runtime_checkpoint_attempt_nonnegative
    CHECK (
      attempt >= 0
    ),

  /*
   * Runtime checkpoint state is orchestration state only.
   */
  CONSTRAINT runtime_checkpoint_never_authorizes_execution
    CHECK (
      execution_authorized = FALSE
    ),

  CONSTRAINT runtime_checkpoint_time_order
    CHECK (
      started_at IS NULL
      OR completed_at IS NULL
      OR completed_at >= started_at
    )
);


CREATE INDEX IF NOT EXISTS
  idx_runtime_checkpoint_claim
ON workflow.runtime_recovery_checkpoints (
  organization_id,
  environment_id,
  status,
  owner_lease_expires_at
);


CREATE INDEX IF NOT EXISTS
  idx_runtime_checkpoint_incident
ON workflow.runtime_recovery_checkpoints (
  organization_id,
  environment_id,
  incident_id,
  stage
);


CREATE INDEX IF NOT EXISTS
  idx_runtime_checkpoint_worker
ON workflow.runtime_recovery_checkpoints (
  owner_worker_id,
  owner_claim_token
)
WHERE owner_worker_id IS NOT NULL;


-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS
  trg_intelligence_runs_updated_at
ON agents.intelligence_runs;

CREATE TRIGGER
  trg_intelligence_runs_updated_at
BEFORE UPDATE
ON agents.intelligence_runs
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_diagnoses_updated_at
ON incidents.diagnoses;

CREATE TRIGGER
  trg_diagnoses_updated_at
BEFORE UPDATE
ON incidents.diagnoses
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_recovery_runs_updated_at
ON execution.recovery_decision_runs;

CREATE TRIGGER
  trg_recovery_runs_updated_at
BEFORE UPDATE
ON execution.recovery_decision_runs
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_recovery_decisions_updated_at
ON execution.recovery_decisions;

CREATE TRIGGER
  trg_recovery_decisions_updated_at
BEFORE UPDATE
ON execution.recovery_decisions
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_execution_authorizations_updated_at
ON execution.authorizations;

CREATE TRIGGER
  trg_execution_authorizations_updated_at
BEFORE UPDATE
ON execution.authorizations
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_execution_requests_updated_at
ON execution.execution_requests;

CREATE TRIGGER
  trg_execution_requests_updated_at
BEFORE UPDATE
ON execution.execution_requests
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_runtime_checkpoints_updated_at
ON workflow.runtime_recovery_checkpoints;

CREATE TRIGGER
  trg_runtime_checkpoints_updated_at
BEFORE UPDATE
ON workflow.runtime_recovery_checkpoints
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();