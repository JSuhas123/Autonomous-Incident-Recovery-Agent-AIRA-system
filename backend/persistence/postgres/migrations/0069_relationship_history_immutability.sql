BEGIN;


-- ============================================================================
-- PHASE 17.7 — TEMPORAL RELATIONSHIP HISTORY
-- ============================================================================
--
-- resources.relationship_history and resources.graph_change_events already
-- exist from migration 0065.
--
-- This migration completes their append-only guarantees.
--
-- Invariants:
--
--   - relationship history is immutable evidence
--   - graph change events are immutable evidence
--   - history must remain in the same tenant/environment as its relationship
--   - relationship history may never be rewritten or deleted
--   - graph events are evidence, never execution authorization
-- ============================================================================


-- ============================================================================
-- RELATIONSHIP HISTORY SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    resources.aira_validate_relationship_history_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    rel_org uuid;
    rel_env uuid;
    rel_source uuid;
    rel_target uuid;
    rel_type text;
BEGIN

    SELECT
        organization_id,
        environment_id,
        source_resource_id,
        target_resource_id,
        relationship_type
    INTO
        rel_org,
        rel_env,
        rel_source,
        rel_target,
        rel_type
    FROM resources.resource_relationships
    WHERE id = NEW.relationship_id;


    IF rel_org IS NULL THEN
        RAISE EXCEPTION
            'RELATIONSHIP_HISTORY_RELATIONSHIP_NOT_FOUND';
    END IF;


    IF rel_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_HISTORY_ORGANIZATION_MISMATCH';
    END IF;


    IF rel_env <> NEW.environment_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_HISTORY_ENVIRONMENT_MISMATCH';
    END IF;


    IF rel_source <> NEW.source_resource_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_HISTORY_SOURCE_MISMATCH';
    END IF;


    IF rel_target <> NEW.target_resource_id THEN
        RAISE EXCEPTION
            'RELATIONSHIP_HISTORY_TARGET_MISMATCH';
    END IF;


    IF rel_type <> NEW.relationship_type THEN
        RAISE EXCEPTION
            'RELATIONSHIP_HISTORY_TYPE_MISMATCH';
    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_relationship_history_scope
ON resources.relationship_history;


CREATE TRIGGER
    trg_relationship_history_scope
BEFORE INSERT
ON resources.relationship_history
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_validate_relationship_history_scope();


-- ============================================================================
-- GENERIC IMMUTABILITY GUARD
-- ============================================================================

CREATE OR REPLACE FUNCTION
    resources.aira_prevent_temporal_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    RAISE EXCEPTION
        'TEMPORAL_GRAPH_EVIDENCE_IMMUTABLE';

END;
$$;


-- ============================================================================
-- RELATIONSHIP HISTORY IMMUTABILITY
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_relationship_history_immutable_update
ON resources.relationship_history;


CREATE TRIGGER
    trg_relationship_history_immutable_update
BEFORE UPDATE
ON resources.relationship_history
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_prevent_temporal_evidence_mutation();


DROP TRIGGER IF EXISTS
    trg_relationship_history_immutable_delete
ON resources.relationship_history;


CREATE TRIGGER
    trg_relationship_history_immutable_delete
BEFORE DELETE
ON resources.relationship_history
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_prevent_temporal_evidence_mutation();


-- ============================================================================
-- GRAPH CHANGE EVENT IMMUTABILITY
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_graph_change_events_immutable_update
ON resources.graph_change_events;


CREATE TRIGGER
    trg_graph_change_events_immutable_update
BEFORE UPDATE
ON resources.graph_change_events
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_prevent_temporal_evidence_mutation();


DROP TRIGGER IF EXISTS
    trg_graph_change_events_immutable_delete
ON resources.graph_change_events;


CREATE TRIGGER
    trg_graph_change_events_immutable_delete
BEFORE DELETE
ON resources.graph_change_events
FOR EACH ROW
EXECUTE FUNCTION
    resources.aira_prevent_temporal_evidence_mutation();


COMMIT;