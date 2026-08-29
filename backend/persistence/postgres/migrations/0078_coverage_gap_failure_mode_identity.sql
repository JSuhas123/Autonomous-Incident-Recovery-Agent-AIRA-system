BEGIN;


-- ============================================================================
-- AIRA PHASE 19
-- KNOWLEDGE COVERAGE ENGINE
--
-- MIGRATION 0078
-- COVERAGE GAP FAILURE-MODE IDENTITY CORRECTION
-- ============================================================================
--
-- Problem
-- -------
--
-- coverage.gaps was originally created with:
--
--     failure_mode_key TEXT NOT NULL
--
-- That assumption is invalid for Phase 19 blind spots such as:
--
--     NO_FAILURE_MODE
--     UNSUPPORTED_RESOURCE_TYPE
--
-- In those cases, the entire meaning of the gap is that no applicable
-- Failure Mode exists.
--
-- Therefore:
--
--     failure_mode_key    = NULL
--     failure_mode_semver = NULL
--
-- is the correct canonical representation.
--
-- This migration makes Failure Mode identity optional while preserving
-- semantic integrity:
--
--   - failure-mode-backed gaps may retain key/version identity
--   - resource/type-level blind spots may have no Failure Mode identity
--   - no fake Failure Mode identifiers are introduced
--
-- SAFETY
-- ------
--
-- This migration:
--
--   - does NOT alter coverage classification
--   - does NOT weaken tenant isolation
--   - does NOT weaken environment isolation
--   - does NOT authorize execution
--   - does NOT mutate Phase 18 knowledge
--   - does NOT create synthetic Failure Modes
--
-- PostgreSQL remains canonical.
-- ============================================================================


-- ============================================================================
-- 1. CURRENT GAPS — FAILURE MODE KEY MAY BE NULL
-- ============================================================================


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    failure_mode_key
DROP NOT NULL;


-- ============================================================================
-- 2. CURRENT GAPS — SEMVER IS OPTIONAL
-- ============================================================================


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    failure_mode_semver
DROP NOT NULL;


-- ============================================================================
-- 3. SNAPSHOT GAPS — KEEP SAME FORENSIC SEMANTICS
-- ============================================================================


ALTER TABLE
    coverage.snapshot_gaps
ALTER COLUMN
    failure_mode_key
DROP NOT NULL;


ALTER TABLE
    coverage.snapshot_gaps
ALTER COLUMN
    failure_mode_semver
DROP NOT NULL;


-- ============================================================================
-- 4. FAILURE MODE IDENTITY CONSISTENCY
-- ============================================================================
--
-- If a semver is present, a Failure Mode key must also be present.
--
-- But both may be NULL for resource/type-level blind spots.
-- ============================================================================


ALTER TABLE
    coverage.gaps
DROP CONSTRAINT IF EXISTS
    coverage_gaps_failure_mode_identity;


ALTER TABLE
    coverage.gaps
ADD CONSTRAINT
    coverage_gaps_failure_mode_identity

CHECK (
    failure_mode_semver IS NULL

    OR

    NULLIF(
        BTRIM(
            failure_mode_key
        ),
        ''
    ) IS NOT NULL
);


ALTER TABLE
    coverage.snapshot_gaps
DROP CONSTRAINT IF EXISTS
    coverage_snapshot_gaps_failure_mode_identity;


ALTER TABLE
    coverage.snapshot_gaps
ADD CONSTRAINT
    coverage_snapshot_gaps_failure_mode_identity

CHECK (
    failure_mode_semver IS NULL

    OR

    NULLIF(
        BTRIM(
            failure_mode_key
        ),
        ''
    ) IS NOT NULL
);


-- ============================================================================
-- 5. INDEXES FOR FAILURE-MODE-BACKED GAPS
-- ============================================================================


CREATE INDEX IF NOT EXISTS
    idx_coverage_gaps_failure_mode_key
ON coverage.gaps (
    organization_id,
    environment_id,
    failure_mode_key
)
WHERE
    failure_mode_key IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshot_gaps_failure_mode_key
ON coverage.snapshot_gaps (
    snapshot_id,
    failure_mode_key
)
WHERE
    failure_mode_key IS NOT NULL;


-- ============================================================================
-- 6. DOCUMENTATION
-- ============================================================================


COMMENT ON COLUMN
    coverage.gaps.failure_mode_key
IS
    'Optional Failure Mode key. NULL is valid for Phase 19 blind spots such as NO_FAILURE_MODE and UNSUPPORTED_RESOURCE_TYPE.';


COMMENT ON COLUMN
    coverage.snapshot_gaps.failure_mode_key
IS
    'Optional historical Failure Mode key. NULL is valid when the recorded blind spot had no applicable Failure Mode.';


COMMENT ON COLUMN
    coverage.gaps.failure_mode_semver
IS
    'Optional Failure Mode version. Must be NULL when no Failure Mode identity exists.';


COMMENT ON COLUMN
    coverage.snapshot_gaps.failure_mode_semver
IS
    'Optional historical Failure Mode version. May be NULL for resource/type-level blind spots.';


COMMIT;