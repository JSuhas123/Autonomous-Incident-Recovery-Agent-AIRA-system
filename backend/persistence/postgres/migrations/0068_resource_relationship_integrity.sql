BEGIN;


-- ============================================================================
-- PHASE 17.6 — RESOURCE RELATIONSHIP INTEGRITY
-- ============================================================================
--
-- resources.resource_relationships already exists and remains the canonical
-- current relationship graph.
--
-- This migration adds the guarantees required by Phase 17:
--
--   1. source Resource must exist;
--   2. target Resource must exist;
--   3. both endpoints must belong to the relationship organization;
--   4. both endpoints must belong to the relationship environment;
--   5. valid_to must be later than valid_from;
--   6. only one live ACTIVE copy of the same semantic edge may exist.
--
-- Relationship history is deliberately NOT implemented here.
-- That belongs to Phase 17.7.
-- ============================================================================


-- ============================================================================
-- ENDPOINT + SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    resources.aira_validate_resource_relationship_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_org uuid;
    source_env uuid;

    target_org uuid;
    target_env uuid;
BEGIN

    SELECT
        organization_id,
        environment_id
    INTO
        source_org,
        source_env
    FROM resources.resources
    WHERE id = NEW.source_resource_id;


    IF source_org IS NULL THEN
        RAISE EXCEPTION
            'RELATIONSHIP_SOURCE_RESOURCE_NOT_FOUND';
    END IF;


    SELECT
        organization_id,
        environment_id
    INTO
        target_org,
        target_env
    FROM resources.resources
    WHERE id = NEW.target_resource_id;


    IF target_org IS NULL THEN
        RAISE EXCEPTION
            'RELATIONSHIP_TARGET_RESOURCE_NOT_FOUND';
    END IF;


    IF source_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_SOURCE_ORGANIZATION_MISMATCH';
    END IF;


    IF source_env <> NEW.environment_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_SOURCE_ENVIRONMENT_MISMATCH';
    END IF;


    IF target_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_TARGET_ORGANIZATION_MISMATCH';
    END IF;


    IF target_env <> NEW.environment_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_TARGET_ENVIRONMENT_MISMATCH';
    END IF;


    IF NEW.source_resource_id =
       NEW.target_resource_id THEN

        RAISE EXCEPTION
            'RELATIONSHIP_SELF_REFERENCE';

    END IF;


    IF NEW.valid_to IS NOT NULL
       AND NEW.valid_to <= NEW.valid_from THEN

        RAISE EXCEPTION
            'RELATIONSHIP_VALIDITY_INVALID';

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_resource_relationship_scope
ON resources.resource_relationships;


CREATE TRIGGER
    trg_resource_relationship_scope
BEFORE INSERT OR UPDATE
ON resources.resource_relationships
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_validate_resource_relationship_scope();


-- ============================================================================
-- ONE LIVE COPY OF EACH SEMANTIC EDGE
-- ============================================================================
--
-- Example:
--
--   application.service A
--        DEPENDS_ON
--   postgres.database B
--
-- may only have one current ACTIVE/open edge.
--
-- Historical versions will be represented by relationship_history in 17.7.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_resource_relationships_one_live_edge
ON resources.resource_relationships (
    organization_id,
    environment_id,
    source_resource_id,
    target_resource_id,
    relationship_type
)
WHERE
    status = 'ACTIVE'
    AND valid_to IS NULL;


-- ============================================================================
-- CURRENT GRAPH LOOKUP INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS
    idx_resource_relationships_current_source
ON resources.resource_relationships (
    organization_id,
    environment_id,
    source_resource_id,
    status,
    relationship_type
)
WHERE valid_to IS NULL;


CREATE INDEX IF NOT EXISTS
    idx_resource_relationships_current_target
ON resources.resource_relationships (
    organization_id,
    environment_id,
    target_resource_id,
    status,
    relationship_type
)
WHERE valid_to IS NULL;


COMMIT;