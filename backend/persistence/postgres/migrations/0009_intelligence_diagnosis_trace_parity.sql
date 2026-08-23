-- ============================================================================
-- AIRA PHASE 13.4C
-- MIGRATION 0009 — INTELLIGENCE + DIAGNOSIS + DECISION TRACE PARITY
-- ============================================================================


-- ============================================================================
-- AGENT INTELLIGENCE RUN PARITY
-- ============================================================================

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS correlation_group_id TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS phase TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS duration_ms BIGINT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS outcome TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS manual_reason TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS coordinator_version TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS reasoning_provider TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS model TEXT;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS context_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS budget_usage JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS security_findings JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS finding_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS hypothesis_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS contradiction_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS error JSONB;

ALTER TABLE agents.intelligence_runs
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_intelligence_runs_database_id_unique
ON agents.intelligence_runs (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_intelligence_runs_correlation
ON agents.intelligence_runs (
  organization_id,
  environment_id,
  correlation_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_intelligence_runs_phase
ON agents.intelligence_runs (
  organization_id,
  environment_id,
  phase,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_intelligence_runs_document_gin
ON agents.intelligence_runs
USING GIN (
  document
);


-- ============================================================================
-- INCIDENT DIAGNOSIS PARITY
-- ============================================================================

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS tenant_public_id TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS correlation_group_id TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS run_external_id TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS outcome TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS probable_root_cause TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS root_cause_category TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS primary_hypothesis_id TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS contradictions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS unresolved_questions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS unknowns JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS false_positive_suspected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS risk JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS recommended_next_step JSONB;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS analysis_started_at TIMESTAMPTZ;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMPTZ;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS coordinator_version TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS reasoning_provider TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS model TEXT;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE incidents.diagnoses
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_diagnoses_database_id_unique
ON incidents.diagnoses (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_diagnoses_correlation
ON incidents.diagnoses (
  organization_id,
  environment_id,
  correlation_id,
  revision DESC
);


CREATE INDEX IF NOT EXISTS
  idx_diagnoses_run_external
ON incidents.diagnoses (
  organization_id,
  environment_id,
  run_external_id
);


CREATE INDEX IF NOT EXISTS
  idx_diagnoses_document_gin
ON incidents.diagnoses
USING GIN (
  document
);


-- ============================================================================
-- DECISION TRACE PARITY
-- ============================================================================

ALTER TABLE audit.decision_traces
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE audit.decision_traces
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_decision_traces_database_id_unique
ON audit.decision_traces (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_decision_traces_decision_scope
ON audit.decision_traces (
  organization_id,
  environment_id,
  public_id
);


CREATE INDEX IF NOT EXISTS
  idx_decision_traces_correlation_latest
ON audit.decision_traces (
  organization_id,
  environment_id,
  correlation_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_decision_traces_decision
ON audit.decision_traces (
  organization_id,
  environment_id,
  decision,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_decision_traces_document_gin
ON audit.decision_traces
USING GIN (
  document
);


-- ============================================================================
-- SAFETY CONSTRAINTS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intelligence_runs_duration_nonnegative'
      AND conrelid = 'agents.intelligence_runs'::regclass
  ) THEN
    ALTER TABLE agents.intelligence_runs
    ADD CONSTRAINT intelligence_runs_duration_nonnegative
    CHECK (
      duration_ms IS NULL
      OR duration_ms >= 0
    );
  END IF;
END
$$;


-- ============================================================================
-- UPDATED_AT
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
  trg_decision_traces_updated_at
ON audit.decision_traces;

CREATE TRIGGER
  trg_decision_traces_updated_at
BEFORE UPDATE
ON audit.decision_traces
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();