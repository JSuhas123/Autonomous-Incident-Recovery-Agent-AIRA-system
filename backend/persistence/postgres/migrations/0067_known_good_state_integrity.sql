BEGIN;


-- ============================================================================
-- PHASE 17.5 — KNOWN-GOOD STATE INTEGRITY
-- ============================================================================
--
-- A known-good state is an evidence-backed designation of an immutable
-- ResourceState.
--
-- This migration guarantees:
--
--   1. known-good Resource and ResourceState belong to the same scope;
--   2. ResourceState belongs to the referenced Resource;
--   3. evidence/provenance of an existing known-good designation cannot
--      silently change;
--   4. lifecycle transitions may update:
--
--          status
--          valid_until
--          superseded_by
--
-- PostgreSQL remains authoritative.
-- ============================================================================


-- ============================================================================
-- SCOPE / RESOURCE-STATE CONSISTENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    resources.aira_validate_known_good_state_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_resource_org uuid;
    resolved_resource_env uuid;

    resolved_state_org uuid;
    resolved_state_env uuid;
    resolved_state_resource uuid;

    resolved_superseded_resource uuid;
    resolved_superseded_org uuid;
    resolved_superseded_env uuid;
BEGIN

    SELECT
        organization_id,
        environment_id
    INTO
        resolved_resource_org,
        resolved_resource_env
    FROM resources.resources
    WHERE id = NEW.resource_id;


    IF resolved_resource_org IS NULL THEN
        RAISE EXCEPTION
            'KNOWN_GOOD_RESOURCE_NOT_FOUND';
    END IF;


    IF resolved_resource_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'KNOWN_GOOD_RESOURCE_ORGANIZATION_MISMATCH';
    END IF;


    IF resolved_resource_env <> NEW.environment_id THEN
        RAISE EXCEPTION
            'KNOWN_GOOD_RESOURCE_ENVIRONMENT_MISMATCH';
    END IF;


    SELECT
        organization_id,
        environment_id,
        resource_id
    INTO
        resolved_state_org,
        resolved_state_env,
        resolved_state_resource
    FROM resources.resource_states
    WHERE id = NEW.resource_state_id;


    IF resolved_state_org IS NULL THEN
        RAISE EXCEPTION
            'KNOWN_GOOD_RESOURCE_STATE_NOT_FOUND';
    END IF;


    IF resolved_state_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'KNOWN_GOOD_STATE_ORGANIZATION_MISMATCH';
    END IF;


    IF resolved_state_env <> NEW.environment_id THEN
        RAISE EXCEPTION
            'KNOWN_GOOD_STATE_ENVIRONMENT_MISMATCH';
    END IF;


    IF resolved_state_resource <> NEW.resource_id THEN
        RAISE EXCEPTION
            'KNOWN_GOOD_STATE_RESOURCE_MISMATCH';
    END IF;


    IF NEW.superseded_by IS NOT NULL THEN

        SELECT
            resource_id,
            organization_id,
            environment_id
        INTO
            resolved_superseded_resource,
            resolved_superseded_org,
            resolved_superseded_env
        FROM resources.known_good_states
        WHERE id = NEW.superseded_by;


        IF resolved_superseded_resource IS NULL THEN
            RAISE EXCEPTION
                'KNOWN_GOOD_SUPERSEDED_TARGET_NOT_FOUND';
        END IF;


        IF resolved_superseded_resource <> NEW.resource_id
           OR resolved_superseded_org <> NEW.organization_id
           OR resolved_superseded_env <> NEW.environment_id THEN

            RAISE EXCEPTION
                'KNOWN_GOOD_SUPERSEDED_TARGET_SCOPE_MISMATCH';

        END IF;

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_known_good_state_scope
ON resources.known_good_states;


CREATE TRIGGER
    trg_known_good_state_scope
BEFORE INSERT OR UPDATE
ON resources.known_good_states
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_validate_known_good_state_scope();


-- ============================================================================
-- FREEZE EVIDENCE / PROVENANCE
-- ============================================================================
--
-- Lifecycle may change.
--
-- Evidence describing WHY the state was accepted as known-good may not.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    resources.aira_guard_known_good_state_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF NEW.public_id
           IS DISTINCT FROM OLD.public_id
       OR NEW.organization_id
           IS DISTINCT FROM OLD.organization_id
       OR NEW.environment_id
           IS DISTINCT FROM OLD.environment_id
       OR NEW.resource_id
           IS DISTINCT FROM OLD.resource_id
       OR NEW.resource_state_id
           IS DISTINCT FROM OLD.resource_state_id
       OR NEW.valid_from
           IS DISTINCT FROM OLD.valid_from
       OR NEW.confidence
           IS DISTINCT FROM OLD.confidence
       OR NEW.evidence_count
           IS DISTINCT FROM OLD.evidence_count
       OR NEW.health_evidence
           IS DISTINCT FROM OLD.health_evidence
       OR NEW.reason
           IS DISTINCT FROM OLD.reason
       OR NEW.source
           IS DISTINCT FROM OLD.source
       OR NEW.approved_by_human
           IS DISTINCT FROM OLD.approved_by_human
       OR NEW.metadata
           IS DISTINCT FROM OLD.metadata
    THEN

        RAISE EXCEPTION
            'KNOWN_GOOD_STATE_EVIDENCE_IMMUTABLE';

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_known_good_state_evidence_immutable
ON resources.known_good_states;


CREATE TRIGGER
    trg_known_good_state_evidence_immutable
BEFORE UPDATE
ON resources.known_good_states
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_guard_known_good_state_update();


COMMIT;