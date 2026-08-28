BEGIN;


-- ============================================================================
-- AIRA PHASE 18.7
-- MIGRATION 0074 — EXECUTION VERSION BINDING INTEGRITY
-- ============================================================================
--
-- Corrects the Playbook execution immutability boundary introduced by 0073.
--
-- PlaybookExecutionService intentionally creates its forensic row BEFORE
-- Playbook registry resolution so lookup/resolution failures are themselves
-- persisted.
--
-- Therefore the initial row contains:
--
--   playbook_checksum = 'pending'
--   minimal playbook_snapshot
--
-- Once the exact ACTIVE Playbook version is resolved, exactly ONE binding is
-- allowed while the execution is still CREATED/EVALUATING:
--
--   version UUID
--   version reference
--   exact checksum
--   exact snapshot
--
-- After that bind, all executed Playbook identity is immutable.
--
-- This does NOT authorize execution.
-- ============================================================================


CREATE OR REPLACE FUNCTION
    execution.protect_playbook_execution_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    version_binding_changed BOOLEAN;

    base_identity_changed BOOLEAN;

    valid_initial_binding BOOLEAN;
BEGIN

    -- ------------------------------------------------------------------------
    -- Ownership and logical execution identity can NEVER change.
    -- ------------------------------------------------------------------------

    base_identity_changed :=
        OLD.execution_id IS DISTINCT FROM
            NEW.execution_id

        OR OLD.organization_id IS DISTINCT FROM
            NEW.organization_id

        OR OLD.environment_id IS DISTINCT FROM
            NEW.environment_id

        OR OLD.tenant_public_id IS DISTINCT FROM
            NEW.tenant_public_id

        OR OLD.playbook_id IS DISTINCT FROM
            NEW.playbook_id

        OR OLD.playbook_version IS DISTINCT FROM
            NEW.playbook_version;


    IF base_identity_changed THEN

        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_IMMUTABLE_IDENTITY_VIOLATION';

    END IF;


    -- ------------------------------------------------------------------------
    -- Exact executable knowledge binding.
    -- ------------------------------------------------------------------------

    version_binding_changed :=
        OLD.playbook_version_id IS DISTINCT FROM
            NEW.playbook_version_id

        OR OLD.version_ref IS DISTINCT FROM
            NEW.version_ref

        OR OLD.playbook_checksum IS DISTINCT FROM
            NEW.playbook_checksum

        OR OLD.playbook_snapshot IS DISTINCT FROM
            NEW.playbook_snapshot;


    IF version_binding_changed THEN

        valid_initial_binding :=
            OLD.playbook_checksum =
                'pending'

            AND NEW.playbook_checksum <>
                'pending'

            AND OLD.status IN (
                'CREATED',
                'EVALUATING'
            )

            AND NEW.playbook_snapshot IS NOT NULL

            AND jsonb_typeof(
                NEW.playbook_snapshot
            ) =
                'object';


        IF NOT valid_initial_binding THEN

            RAISE EXCEPTION
                'PLAYBOOK_EXECUTION_IMMUTABLE_VERSION_BINDING_VIOLATION';

        END IF;

    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_playbook_execution_identity
ON execution.playbook_executions;


CREATE TRIGGER
    trg_protect_playbook_execution_identity
BEFORE UPDATE
ON execution.playbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.protect_playbook_execution_identity();


-- ============================================================================
-- BINDING CONSISTENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    execution.validate_playbook_version_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    stored_semver TEXT;

    stored_playbook_key TEXT;

    stored_checksum TEXT;
BEGIN

    IF NEW.playbook_version_id IS NULL THEN

        RETURN NEW;

    END IF;


    SELECT
        pv.semver,
        pd.playbook_key,
        pv.checksum
    INTO
        stored_semver,
        stored_playbook_key,
        stored_checksum

    FROM knowledge.playbook_versions pv

    JOIN knowledge.playbook_definitions pd
      ON pd.id =
         pv.playbook_definition_id

    WHERE pv.id =
        NEW.playbook_version_id;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_PLAYBOOK_VERSION_NOT_FOUND';

    END IF;


    IF stored_playbook_key <>
       NEW.playbook_id THEN

        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_PLAYBOOK_KEY_MISMATCH';

    END IF;


    IF stored_semver <>
       NEW.playbook_version THEN

        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_PLAYBOOK_SEMVER_MISMATCH';

    END IF;


    /*
     * During the initial forensic row the checksum may still be 'pending'.
     *
     * Once bound it must exactly equal the canonical knowledge checksum.
     */
    IF NEW.playbook_checksum <>
           'pending'

       AND stored_checksum IS DISTINCT FROM
           NEW.playbook_checksum THEN

        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_PLAYBOOK_CHECKSUM_MISMATCH';

    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_validate_playbook_version_binding
ON execution.playbook_executions;


CREATE TRIGGER
    trg_validate_playbook_version_binding
BEFORE INSERT OR UPDATE
ON execution.playbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.validate_playbook_version_binding();


-- ============================================================================
-- RUNBOOK BINDING CONSISTENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    execution.validate_runbook_version_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    stored_semver TEXT;

    stored_runbook_key TEXT;

    stored_checksum TEXT;
BEGIN

    IF NEW.runbook_version_id IS NULL THEN

        RETURN NEW;

    END IF;


    SELECT
        rv.semver,
        rd.runbook_key,
        rv.checksum
    INTO
        stored_semver,
        stored_runbook_key,
        stored_checksum

    FROM knowledge.runbook_versions rv

    JOIN knowledge.runbook_definitions rd
      ON rd.id =
         rv.runbook_definition_id

    WHERE rv.id =
        NEW.runbook_version_id;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            'RUNBOOK_EXECUTION_RUNBOOK_VERSION_NOT_FOUND';

    END IF;


    IF stored_runbook_key <>
       NEW.runbook_id THEN

        RAISE EXCEPTION
            'RUNBOOK_EXECUTION_RUNBOOK_KEY_MISMATCH';

    END IF;


    IF stored_semver <>
       NEW.runbook_version THEN

        RAISE EXCEPTION
            'RUNBOOK_EXECUTION_RUNBOOK_SEMVER_MISMATCH';

    END IF;


    IF stored_checksum IS DISTINCT FROM
       NEW.runbook_checksum THEN

        RAISE EXCEPTION
            'RUNBOOK_EXECUTION_RUNBOOK_CHECKSUM_MISMATCH';

    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_validate_runbook_version_binding
ON execution.runbook_executions;


CREATE TRIGGER
    trg_validate_runbook_version_binding
BEFORE INSERT OR UPDATE
ON execution.runbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.validate_runbook_version_binding();


COMMENT ON FUNCTION
    execution.protect_playbook_execution_identity()
IS
    'Allows exactly one pending-to-canonical Playbook version binding before execution, then permanently freezes execution identity.';


COMMIT;