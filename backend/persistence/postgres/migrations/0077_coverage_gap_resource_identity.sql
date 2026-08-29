BEGIN;


-- ============================================================================
-- AIRA PHASE 19
-- KNOWLEDGE COVERAGE ENGINE
--
-- MIGRATION 0077
-- COVERAGE GAP RESOURCE IDENTITY CORRECTION
-- ============================================================================
--
-- Problem
-- -------
--
-- coverage.gaps was originally created with:
--
--     resource_public_id TEXT NOT NULL
--
-- That assumption is too strict for Phase 19 blind spots.
--
-- A valid coverage gap may be identified by:
--
--     canonical resource_id
--
-- while a public resource identifier is unavailable in the coverage-gap
-- projection.
--
-- Example:
--
--     resource_id        = <canonical PostgreSQL UUID>
--     resource_public_id = NULL
--     resource_type      = application.service
--     reason_code        = NO_FAILURE_MODE
--
-- This is still a completely valid and attributable coverage gap.
--
-- Historical snapshot gaps already allow nullable resource_public_id.
--
-- This migration aligns current coverage.gaps with that forensic model while
-- ensuring a gap cannot lose all resource identity.
--
-- SAFETY
-- ------
--
-- This migration:
--
--   - does NOT weaken tenant isolation
--   - does NOT weaken environment isolation
--   - does NOT change execution authorization
--   - does NOT change coverage classification
--   - does NOT generate resource identifiers
--   - does NOT alter Phase 17 resource truth
--
-- PostgreSQL remains canonical.
-- ============================================================================


-- ============================================================================
-- 1. ALLOW NULL PUBLIC RESOURCE IDENTIFIER
-- ============================================================================


ALTER TABLE
    coverage.gaps
ALTER COLUMN
    resource_public_id
DROP NOT NULL;


-- ============================================================================
-- 2. REQUIRE SOME RESOURCE IDENTITY
-- ============================================================================
--
-- Current gaps can be represented through:
--
--   resource_id
--   OR resource_public_id
--   OR resource_type
--
-- The third case is necessary for UNSUPPORTED_RESOURCE_TYPE or other
-- type-level blind spots where no canonical resource row can be bound.
--
-- At least one must exist.
-- ============================================================================


ALTER TABLE
    coverage.gaps
DROP CONSTRAINT IF EXISTS
    coverage_gaps_resource_identity;


ALTER TABLE
    coverage.gaps
ADD CONSTRAINT
    coverage_gaps_resource_identity

CHECK (
    resource_id IS NOT NULL

    OR

    NULLIF(
        BTRIM(
            resource_public_id
        ),
        ''
    ) IS NOT NULL

    OR

    NULLIF(
        BTRIM(
            resource_type
        ),
        ''
    ) IS NOT NULL
);


-- ============================================================================
-- 3. APPLY SAME FORENSIC IDENTITY GUARANTEE TO SNAPSHOT GAPS
-- ============================================================================


ALTER TABLE
    coverage.snapshot_gaps
DROP CONSTRAINT IF EXISTS
    coverage_snapshot_gaps_resource_identity;


ALTER TABLE
    coverage.snapshot_gaps
ADD CONSTRAINT
    coverage_snapshot_gaps_resource_identity

CHECK (
    resource_id IS NOT NULL

    OR

    NULLIF(
        BTRIM(
            resource_public_id
        ),
        ''
    ) IS NOT NULL

    OR

    NULLIF(
        BTRIM(
            resource_type
        ),
        ''
    ) IS NOT NULL
);


-- ============================================================================
-- 4. SUPPORT RESOURCE-ID BASED CURRENT GAP QUERIES
-- ============================================================================


CREATE INDEX IF NOT EXISTS
    idx_coverage_gaps_resource_id
ON coverage.gaps (
    organization_id,
    environment_id,
    resource_id
)
WHERE
    resource_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_coverage_gaps_resource_public_id
ON coverage.gaps (
    organization_id,
    environment_id,
    resource_public_id
)
WHERE
    resource_public_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_coverage_snapshot_gaps_resource_id
ON coverage.snapshot_gaps (
    snapshot_id,
    resource_id
)
WHERE
    resource_id IS NOT NULL;


-- ============================================================================
-- 5. DOCUMENT INTENT
-- ============================================================================


COMMENT ON COLUMN
    coverage.gaps.resource_public_id
IS
    'Optional forensic public resource identifier. Canonical resource_id or resource_type may independently identify a valid Phase 19 coverage gap.';


COMMENT ON COLUMN
    coverage.snapshot_gaps.resource_public_id
IS
    'Optional historical public resource identifier preserved when available. Snapshot gaps may instead retain canonical resource_id or resource_type.';


COMMIT;