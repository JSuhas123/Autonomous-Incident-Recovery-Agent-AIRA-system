BEGIN;


-- ============================================================================
-- AIRA PHASE 19
-- KNOWLEDGE COVERAGE ENGINE
--
-- MIGRATION 0075 — KNOWLEDGE COVERAGE FOUNDATION
-- ============================================================================
--
-- Purpose:
--
--   Persist AIRA's knowledge of its own recovery coverage.
--
-- PostgreSQL remains canonical.
--
-- This schema does NOT:
--
--   - authorize execution
--   - replace Phase 17 Resource Graph
--   - replace Phase 18 knowledge
--   - replace policy
--   - replace authorization
--   - make Qdrant canonical
--
-- Coverage answers:
--
--   "Can AIRA prove that it has a production-ready recovery path?"
--
-- Coverage NEVER means:
--
--   "AIRA is authorized to execute."
--
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS
    coverage;


-- ============================================================================
-- CURRENT COVERAGE EVALUATIONS
-- ============================================================================
--
-- Canonical evaluation unit:
--
--   Resource
--       ×
--   FailureModeVersion
--       ×
--   Environment
--
-- One current evaluation exists for a Resource × FailureModeVersion pair.
--
-- Historical posture is preserved separately through coverage.snapshots.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    coverage.evaluations (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        resource_id uuid NOT NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        resource_public_id text NOT NULL,

        resource_type text NOT NULL,

        failure_mode_version_id uuid NOT NULL
            REFERENCES knowledge.failure_mode_versions(id)
            ON DELETE RESTRICT,

        failure_mode_key text NOT NULL,

        failure_mode_semver text NOT NULL,

        classification text NOT NULL,

        reason_codes text[] NOT NULL
            DEFAULT '{}'::text[],

        readiness jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        confidence numeric(6,5) NOT NULL
            DEFAULT 0,

        evaluation_basis jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        evaluator_version text NOT NULL
            DEFAULT 'phase19-v1',

        evaluated_at timestamptz NOT NULL
            DEFAULT now(),

        execution_authorized boolean NOT NULL
            DEFAULT false,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        updated_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT coverage_evaluations_classification
            CHECK (
                classification IN (
                    'COVERED',
                    'PARTIAL',
                    'HUMAN_ONLY',
                    'UNKNOWN'
                )
            ),

        CONSTRAINT coverage_evaluations_confidence
            CHECK (
                confidence >= 0
                AND confidence <= 1
            ),

        CONSTRAINT coverage_evaluations_readiness_object
            CHECK (
                jsonb_typeof(
                    readiness
                ) = 'object'
            ),

        CONSTRAINT coverage_evaluations_basis_object
            CHECK (
                jsonb_typeof(
                    evaluation_basis
                ) = 'object'
            ),

        CONSTRAINT coverage_evaluations_never_authorize
            CHECK (
                execution_authorized = false
            ),

        CONSTRAINT coverage_evaluations_unique_current
            UNIQUE (
                organization_id,
                environment_id,
                resource_id,
                failure_mode_version_id
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_coverage_evaluations_scope
ON coverage.evaluations (
    organization_id,
    environment_id,
    classification
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_evaluations_resource
ON coverage.evaluations (
    organization_id,
    environment_id,
    resource_id
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_evaluations_resource_type
ON coverage.evaluations (
    organization_id,
    environment_id,
    resource_type,
    classification
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_evaluations_failure_mode
ON coverage.evaluations (
    organization_id,
    environment_id,
    failure_mode_key,
    classification
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_evaluations_reason_codes
ON coverage.evaluations
USING GIN (
    reason_codes
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_evaluations_readiness
ON coverage.evaluations
USING GIN (
    readiness
);


-- ============================================================================
-- COVERAGE SNAPSHOTS
-- ============================================================================
--
-- Historical enterprise posture.
--
-- Example:
--
--   2026-08-29  Coverage 84.6%
--   2026-09-29  Coverage 87.2%
--
-- Snapshots are immutable after creation.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    coverage.snapshots (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        resources_count integer NOT NULL
            DEFAULT 0,

        applicable_failure_modes_count integer NOT NULL
            DEFAULT 0,

        covered_count integer NOT NULL
            DEFAULT 0,

        partial_count integer NOT NULL
            DEFAULT 0,

        human_only_count integer NOT NULL
            DEFAULT 0,

        unknown_count integer NOT NULL
            DEFAULT 0,

        coverage_percentage numeric(6,3) NOT NULL
            DEFAULT 0,

        summary jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        generation_basis jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        generated_at timestamptz NOT NULL
            DEFAULT now(),

        execution_authorized boolean NOT NULL
            DEFAULT false,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT coverage_snapshots_resource_count
            CHECK (
                resources_count >= 0
            ),

        CONSTRAINT coverage_snapshots_failure_mode_count
            CHECK (
                applicable_failure_modes_count >= 0
            ),

        CONSTRAINT coverage_snapshots_covered_count
            CHECK (
                covered_count >= 0
            ),

        CONSTRAINT coverage_snapshots_partial_count
            CHECK (
                partial_count >= 0
            ),

        CONSTRAINT coverage_snapshots_human_only_count
            CHECK (
                human_only_count >= 0
            ),

        CONSTRAINT coverage_snapshots_unknown_count
            CHECK (
                unknown_count >= 0
            ),

        CONSTRAINT coverage_snapshots_percentage
            CHECK (
                coverage_percentage >= 0
                AND coverage_percentage <= 100
            ),

        CONSTRAINT coverage_snapshots_summary_object
            CHECK (
                jsonb_typeof(
                    summary
                ) = 'object'
            ),

        CONSTRAINT coverage_snapshots_basis_object
            CHECK (
                jsonb_typeof(
                    generation_basis
                ) = 'object'
            ),

        CONSTRAINT coverage_snapshots_never_authorize
            CHECK (
                execution_authorized = false
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshots_scope_time
ON coverage.snapshots (
    organization_id,
    environment_id,
    generated_at DESC
);


-- ============================================================================
-- SNAPSHOT ITEMS
-- ============================================================================
--
-- Snapshot items deliberately copy forensic identifiers instead of relying
-- exclusively on live foreign keys.
--
-- Historical coverage must remain reconstructible even if a resource is later
-- removed from the active Resource Graph.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    coverage.snapshot_items (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        snapshot_id uuid NOT NULL
            REFERENCES coverage.snapshots(id)
            ON DELETE CASCADE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        evaluation_id uuid NULL,

        resource_id uuid NULL,

        resource_public_id text NOT NULL,

        resource_type text NOT NULL,

        failure_mode_version_id uuid NULL,

        failure_mode_key text NOT NULL,

        failure_mode_semver text NOT NULL,

        classification text NOT NULL,

        reason_codes text[] NOT NULL
            DEFAULT '{}'::text[],

        readiness jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        confidence numeric(6,5) NOT NULL
            DEFAULT 0,

        evaluation_basis jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        evaluated_at timestamptz NOT NULL,

        execution_authorized boolean NOT NULL
            DEFAULT false,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT coverage_snapshot_items_classification
            CHECK (
                classification IN (
                    'COVERED',
                    'PARTIAL',
                    'HUMAN_ONLY',
                    'UNKNOWN'
                )
            ),

        CONSTRAINT coverage_snapshot_items_confidence
            CHECK (
                confidence >= 0
                AND confidence <= 1
            ),

        CONSTRAINT coverage_snapshot_items_never_authorize
            CHECK (
                execution_authorized = false
            ),

        CONSTRAINT coverage_snapshot_items_unique
            UNIQUE (
                snapshot_id,
                resource_public_id,
                failure_mode_key,
                failure_mode_semver
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshot_items_snapshot
ON coverage.snapshot_items (
    snapshot_id,
    classification
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshot_items_resource_type
ON coverage.snapshot_items (
    snapshot_id,
    resource_type,
    classification
);


-- ============================================================================
-- COVERAGE GAPS
-- ============================================================================
--
-- Structured explanation of why an evaluation is not fully covered.
--
-- Priority is deliberately NOT interpreted as authorization.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    coverage.gaps (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        organization_id uuid NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        evaluation_id uuid NOT NULL
            REFERENCES coverage.evaluations(id)
            ON DELETE CASCADE,

        resource_id uuid NOT NULL
            REFERENCES resources.resources(id)
            ON DELETE CASCADE,

        resource_public_id text NOT NULL,

        resource_type text NOT NULL,

        failure_mode_key text NOT NULL,

        classification text NOT NULL,

        reason_code text NOT NULL,

        severity text NOT NULL
            DEFAULT 'MEDIUM',

        priority_score numeric(8,5) NOT NULL
            DEFAULT 0,

        explanation text NULL,

        evidence jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        detected_at timestamptz NOT NULL
            DEFAULT now(),

        resolved_at timestamptz NULL,

        execution_authorized boolean NOT NULL
            DEFAULT false,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        updated_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT coverage_gaps_classification
            CHECK (
                classification IN (
                    'PARTIAL',
                    'HUMAN_ONLY',
                    'UNKNOWN'
                )
            ),

        CONSTRAINT coverage_gaps_severity
            CHECK (
                severity IN (
                    'LOW',
                    'MEDIUM',
                    'HIGH',
                    'CRITICAL'
                )
            ),

        CONSTRAINT coverage_gaps_priority
            CHECK (
                priority_score >= 0
            ),

        CONSTRAINT coverage_gaps_evidence_object
            CHECK (
                jsonb_typeof(
                    evidence
                ) = 'object'
            ),

        CONSTRAINT coverage_gaps_never_authorize
            CHECK (
                execution_authorized = false
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_coverage_gaps_scope
ON coverage.gaps (
    organization_id,
    environment_id,
    resolved_at,
    priority_score DESC
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_gaps_reason
ON coverage.gaps (
    organization_id,
    environment_id,
    reason_code
);


-- ============================================================================
-- IMMUTABLE HISTORICAL SNAPSHOTS
-- ============================================================================


CREATE OR REPLACE FUNCTION
    coverage.protect_snapshot_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    RAISE EXCEPTION
        'COVERAGE_SNAPSHOT_IMMUTABLE';

END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_coverage_snapshot_update
ON coverage.snapshots;


CREATE TRIGGER
    trg_protect_coverage_snapshot_update
BEFORE UPDATE
ON coverage.snapshots
FOR EACH ROW
EXECUTE FUNCTION
    coverage.protect_snapshot_immutability();


DROP TRIGGER IF EXISTS
    trg_protect_coverage_snapshot_item_update
ON coverage.snapshot_items;


CREATE TRIGGER
    trg_protect_coverage_snapshot_item_update
BEFORE UPDATE
ON coverage.snapshot_items
FOR EACH ROW
EXECUTE FUNCTION
    coverage.protect_snapshot_immutability();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
--
-- Phase 19 coverage is environment-specific tenant posture.
--
-- Unlike Phase 18 GLOBAL knowledge, there is no global Coverage Evaluation.
-- ============================================================================


ALTER TABLE
    coverage.evaluations
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    coverage.evaluations
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    coverage.snapshots
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    coverage.snapshots
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    coverage.snapshot_items
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    coverage.snapshot_items
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    coverage.gaps
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    coverage.gaps
FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- EVALUATION POLICIES
-- ============================================================================


DROP POLICY IF EXISTS
    coverage_evaluations_select
ON coverage.evaluations;


CREATE POLICY
    coverage_evaluations_select
ON coverage.evaluations
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    coverage_evaluations_insert
ON coverage.evaluations;


CREATE POLICY
    coverage_evaluations_insert
ON coverage.evaluations
FOR INSERT
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = false
);


DROP POLICY IF EXISTS
    coverage_evaluations_update
ON coverage.evaluations;


CREATE POLICY
    coverage_evaluations_update
ON coverage.evaluations
FOR UPDATE
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

    AND

    execution_authorized = false
);


DROP POLICY IF EXISTS
    coverage_evaluations_delete
ON coverage.evaluations;


CREATE POLICY
    coverage_evaluations_delete
ON coverage.evaluations
FOR DELETE
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


-- ============================================================================
-- SNAPSHOT POLICIES
-- ============================================================================


DROP POLICY IF EXISTS
    coverage_snapshots_select
ON coverage.snapshots;


CREATE POLICY
    coverage_snapshots_select
ON coverage.snapshots
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    coverage_snapshots_insert
ON coverage.snapshots;


CREATE POLICY
    coverage_snapshots_insert
ON coverage.snapshots
FOR INSERT
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = false
);


DROP POLICY IF EXISTS
    coverage_snapshot_items_select
ON coverage.snapshot_items;


CREATE POLICY
    coverage_snapshot_items_select
ON coverage.snapshot_items
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    coverage_snapshot_items_insert
ON coverage.snapshot_items;


CREATE POLICY
    coverage_snapshot_items_insert
ON coverage.snapshot_items
FOR INSERT
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = false
);


-- ============================================================================
-- GAP POLICIES
-- ============================================================================


DROP POLICY IF EXISTS
    coverage_gaps_select
ON coverage.gaps;


CREATE POLICY
    coverage_gaps_select
ON coverage.gaps
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    coverage_gaps_insert
ON coverage.gaps;


CREATE POLICY
    coverage_gaps_insert
ON coverage.gaps
FOR INSERT
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = false
);


DROP POLICY IF EXISTS
    coverage_gaps_update
ON coverage.gaps;


CREATE POLICY
    coverage_gaps_update
ON coverage.gaps
FOR UPDATE
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

    AND

    execution_authorized = false
);


DROP POLICY IF EXISTS
    coverage_gaps_delete
ON coverage.gaps;


CREATE POLICY
    coverage_gaps_delete
ON coverage.gaps
FOR DELETE
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


COMMIT;