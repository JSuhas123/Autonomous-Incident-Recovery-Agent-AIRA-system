-- ============================================================================
-- AIRA PHASE 13.4D
-- MIGRATION 0010 — RECOVERY + EXECUTION REPOSITORY PARITY
-- ============================================================================


-- ============================================================================
-- RECOVERY DECISION RUNS
-- ============================================================================

ALTER TABLE execution.recovery_decision_runs
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE execution.recovery_decision_runs
ADD COLUMN IF NOT EXISTS error JSONB;

ALTER TABLE execution.recovery_decision_runs
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_decision_runs_database_id_unique
ON execution.recovery_decision_runs (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_recovery_decision_runs_document_gin
ON execution.recovery_decision_runs
USING GIN (
  document
);


-- ============================================================================
-- RECOVERY DECISIONS
-- ============================================================================

ALTER TABLE execution.recovery_decisions
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE execution.recovery_decisions
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_recovery_decisions_database_id_unique
ON execution.recovery_decisions (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_recovery_decisions_document_gin
ON execution.recovery_decisions
USING GIN (
  document
);


-- ============================================================================
-- EXECUTION AUTHORIZATIONS
-- ============================================================================

ALTER TABLE execution.authorizations
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE execution.authorizations
ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

ALTER TABLE execution.authorizations
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE execution.authorizations
ADD COLUMN IF NOT EXISTS revoked_reason TEXT;

ALTER TABLE execution.authorizations
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_execution_authorizations_database_id_unique
ON execution.authorizations (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_execution_authorizations_plan
ON execution.authorizations (
  organization_id,
  environment_id,
  plan_id
)
WHERE plan_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_execution_authorizations_document_gin
ON execution.authorizations
USING GIN (
  document
);


-- ============================================================================
-- EXECUTION REQUESTS
-- ============================================================================

ALTER TABLE execution.execution_requests
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE execution.execution_requests
ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

ALTER TABLE execution.execution_requests
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE execution.execution_requests
ADD COLUMN IF NOT EXISTS rollback JSONB;

ALTER TABLE execution.execution_requests
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_execution_requests_database_id_unique
ON execution.execution_requests (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_execution_requests_plan
ON execution.execution_requests (
  organization_id,
  environment_id,
  plan_id
)
WHERE plan_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_execution_requests_document_gin
ON execution.execution_requests
USING GIN (
  document
);


-- ============================================================================
-- RUNTIME RECOVERY CHECKPOINTS
-- ============================================================================

ALTER TABLE workflow.runtime_recovery_checkpoints
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE workflow.runtime_recovery_checkpoints
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_runtime_recovery_checkpoint_database_id_unique
ON workflow.runtime_recovery_checkpoints (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_runtime_recovery_checkpoint_document_gin
ON workflow.runtime_recovery_checkpoints
USING GIN (
  document
);