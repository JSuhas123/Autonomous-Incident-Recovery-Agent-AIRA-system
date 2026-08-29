BEGIN;


-- ============================================================================
-- AIRA PHASE 19.20
-- KNOWLEDGE COVERAGE ENGINE
--
-- MIGRATION 0076 — COMPLETE GAP + BLIND-SPOT HISTORY
-- ============================================================================
--
-- Purpose:
--
--   Complete the persistence model introduced by 0075.
--
-- 0075 assumed every coverage gap belonged to an existing CoverageEvaluation.
--
-- That assumption does NOT hold for important Phase 19 blind spots such as:
--
--   NO_FAILURE_MODE
--   UNSUPPORTED_RESOURCE_TYPE
--
-- because those conditions may exist before any Resource × FailureMode
-- evaluation can exist.
--
-- This migration therefore:
--
--   1. allows current gaps without an evaluation
--   2. allows forensic gaps without a live resource FK
--   3. adds deterministic gap identity
--   4. tracks first/last detection and current resolution
--   5. adds immutable per-snapshot gap history
--
-- SAFETY:
--
--   Coverage still never authorizes execution.
-- ============================================================================


-- ============================================================================
-- CURRENT GAP MODEL
-- ============================================================================


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    evaluation_id
DROP NOT NULL;


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    resource_id
DROP NOT NULL;


ALTER TABLE
    coverage.gaps
ADD COLUMN IF NOT EXISTS
    gap_key text;


ALTER TABLE
    coverage.gaps
ADD COLUMN IF NOT EXISTS
    failure_mode_semver text;


ALTER TABLE
    coverage.gaps
ADD COLUMN IF NOT EXISTS
    latest_snapshot_id uuid
        REFERENCES coverage.snapshots(id)
        ON DELETE SET NULL;


ALTER TABLE
    coverage.gaps
ADD COLUMN IF NOT EXISTS
    last_detected_at timestamptz;


-- Existing 0075 rows receive a stable forensic identity.

UPDATE
    coverage.gaps
SET
    gap_key =
        COALESCE(
            gap_key,
            public_id
        ),

    last_detected_at =
        COALESCE(
            last_detected_at,
            detected_at,
            created_at,
            now()
        )
WHERE
    gap_key IS NULL
    OR last_detected_at IS NULL;


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    gap_key
SET NOT NULL;


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    last_detected_at
SET NOT NULL;


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    last_detected_at
SET DEFAULT now();


-- One logical current gap per environment.
--
-- A resolved gap may later reappear. In that case Phase 19 reopens the same
-- logical gap row while immutable snapshot history preserves every posture.

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_coverage_gaps_logical_identity
ON coverage.gaps (
    organization_id,
    environment_id,
    gap_key
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_gaps_snapshot
ON coverage.gaps (
    organization_id,
    environment_id,
    latest_snapshot_id
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_gaps_last_detected
ON coverage.gaps (
    organization_id,
    environment_id,
    last_detected_at DESC
);


-- ============================================================================
-- IMMUTABLE SNAPSHOT GAP HISTORY
-- ============================================================================
--
-- coverage.snapshots stores headline historical posture.
--
-- coverage.snapshot_items stores historical Resource × FailureMode evaluations.
--
-- coverage.snapshot_gaps stores the exact historical deficiencies/blind spots.
--
-- This allows reconstruction of:
--
--   "Why was coverage only 84.6% on this date?"
--
-- including blind spots that had no FailureMode evaluation.
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    coverage.snapshot_gaps (
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

        gap_key text NOT NULL,

        evaluation_id uuid NULL,

        resource_id uuid NULL,

        resource_public_id text NULL,

        resource_type text NULL,

        failure_mode_key text NULL,

        failure_mode_semver text NULL,

        classification text NOT NULL,

        reason_code text NOT NULL,

        severity text NOT NULL
            DEFAULT 'MEDIUM',

        priority_score numeric(8,5) NOT NULL
            DEFAULT 0,

        explanation text NULL,

        evidence jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        detected_at timestamptz NOT NULL,

        execution_authorized boolean NOT NULL
            DEFAULT false,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT coverage_snapshot_gaps_classification
            CHECK (
                classification IN (
                    'PARTIAL',
                    'HUMAN_ONLY',
                    'UNKNOWN'
                )
            ),

        CONSTRAINT coverage_snapshot_gaps_severity
            CHECK (
                severity IN (
                    'LOW',
                    'MEDIUM',
                    'HIGH',
                    'CRITICAL'
                )
            ),

        CONSTRAINT coverage_snapshot_gaps_priority_score
            CHECK (
                priority_score >= 0
            ),

        CONSTRAINT coverage_snapshot_gaps_evidence_object
            CHECK (
                jsonb_typeof(
                    evidence
                ) = 'object'
            ),

        CONSTRAINT coverage_snapshot_gaps_never_authorize
            CHECK (
                execution_authorized = false
            ),

        CONSTRAINT coverage_snapshot_gaps_unique
            UNIQUE (
                snapshot_id,
                gap_key
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshot_gaps_snapshot_priority
ON coverage.snapshot_gaps (
    snapshot_id,
    priority_score DESC
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshot_gaps_reason
ON coverage.snapshot_gaps (
    snapshot_id,
    reason_code
);


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshot_gaps_resource
ON coverage.snapshot_gaps (
    snapshot_id,
    resource_public_id
);


-- ============================================================================
-- IMMUTABILITY
-- ============================================================================


DROP TRIGGER IF EXISTS
    trg_protect_coverage_snapshot_gap_update
ON coverage.snapshot_gaps;


CREATE TRIGGER
    trg_protect_coverage_snapshot_gap_update
BEFORE UPDATE
ON coverage.snapshot_gaps
FOR EACH ROW
EXECUTE FUNCTION
    coverage.protect_snapshot_immutability();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================


ALTER TABLE
    coverage.snapshot_gaps
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    coverage.snapshot_gaps
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    coverage_snapshot_gaps_select
ON coverage.snapshot_gaps;


CREATE POLICY
    coverage_snapshot_gaps_select
ON coverage.snapshot_gaps
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    coverage_snapshot_gaps_insert
ON coverage.snapshot_gaps;


CREATE POLICY
    coverage_snapshot_gaps_insert
ON coverage.snapshot_gaps
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


COMMIT;