BEGIN;


-- ============================================================================
-- PHASE 17.4 — RESOURCE STATE IMMUTABILITY
--
-- resources.resource_states was introduced in migration 0065.
--
-- This migration completes the persistence guarantees required by the
-- Resource Graph architecture:
--
--   1. ResourceState is append-only historical evidence.
--   2. ResourceState cannot be updated.
--   3. ResourceState cannot be deleted.
--   4. A ResourceState must belong to the same organization/environment
--      as its Resource.
--
-- PostgreSQL remains authoritative.
--
-- Repository-level conventions are NOT sufficient for immutability.
-- These guarantees are enforced at the database layer.
-- ============================================================================


-- ============================================================================
-- RESOURCE STATE SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    resources.aira_validate_resource_state_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_resource_organization_id uuid;
    resolved_resource_environment_id uuid;
BEGIN

    SELECT
        organization_id,
        environment_id
    INTO
        resolved_resource_organization_id,
        resolved_resource_environment_id
    FROM resources.resources
    WHERE id = NEW.resource_id;


    IF resolved_resource_organization_id IS NULL THEN
        RAISE EXCEPTION
            'RESOURCE_STATE_RESOURCE_NOT_FOUND';
    END IF;


    IF resolved_resource_organization_id
        <> NEW.organization_id THEN

        RAISE EXCEPTION
            'RESOURCE_STATE_ORGANIZATION_SCOPE_MISMATCH';

    END IF;


    IF resolved_resource_environment_id
        <> NEW.environment_id THEN

        RAISE EXCEPTION
            'RESOURCE_STATE_ENVIRONMENT_SCOPE_MISMATCH';

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_resource_state_scope
ON resources.resource_states;


CREATE TRIGGER
    trg_resource_state_scope
BEFORE INSERT
ON resources.resource_states
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_validate_resource_state_scope();


-- ============================================================================
-- RESOURCE STATES ARE IMMUTABLE
-- ============================================================================

CREATE OR REPLACE FUNCTION
    resources.aira_prevent_resource_state_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    RAISE EXCEPTION
        'RESOURCE_STATE_IMMUTABLE';

END;
$$;


DROP TRIGGER IF EXISTS
    trg_resource_states_immutable_update
ON resources.resource_states;


CREATE TRIGGER
    trg_resource_states_immutable_update
BEFORE UPDATE
ON resources.resource_states
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_prevent_resource_state_mutation();


DROP TRIGGER IF EXISTS
    trg_resource_states_immutable_delete
ON resources.resource_states;


CREATE TRIGGER
    trg_resource_states_immutable_delete
BEFORE DELETE
ON resources.resource_states
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_prevent_resource_state_mutation();


COMMIT;