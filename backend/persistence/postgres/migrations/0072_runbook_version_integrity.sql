BEGIN;


-- ============================================================================
-- PHASE 18.5
-- RUNBOOK DEFINITION + IMMUTABLE VERSION INTEGRITY
--
-- Invariants:
--
-- 1. RunbookDefinition owns stable logical identity.
-- 2. RunbookVersion owns the exact deterministic operational procedure.
-- 3. Version scope must match Definition scope.
-- 4. Only one ACTIVE version may exist per Definition.
-- 5. Executed versions are immutable.
-- 6. Executed versions cannot be deleted.
-- 7. Lifecycle administration may continue without changing executed content.
-- 8. Runbooks describe approved procedures but never authorize execution.
-- 9. Registered action handlers remain runtime-controlled code.
-- 10. Arbitrary command generation is not introduced by this schema.
-- ============================================================================


-- ============================================================================
-- VERSION / DEFINITION SCOPE CONSISTENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    knowledge.validate_runbook_version_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    definition_row
        knowledge.runbook_definitions%ROWTYPE;
BEGIN

    SELECT *
    INTO definition_row
    FROM knowledge.runbook_definitions
    WHERE id =
        NEW.runbook_definition_id;


    IF NOT FOUND THEN
        RAISE EXCEPTION
            'RUNBOOK_DEFINITION_NOT_FOUND'
            USING ERRCODE = '23503';
    END IF;


    IF
        NEW.scope_type IS DISTINCT FROM
        definition_row.scope_type
    THEN
        RAISE EXCEPTION
            'RUNBOOK_VERSION_SCOPE_MISMATCH';
    END IF;


    IF
        NEW.organization_id IS DISTINCT FROM
        definition_row.organization_id
    THEN
        RAISE EXCEPTION
            'RUNBOOK_VERSION_ORGANIZATION_MISMATCH';
    END IF;


    IF
        NEW.environment_id IS DISTINCT FROM
        definition_row.environment_id
    THEN
        RAISE EXCEPTION
            'RUNBOOK_VERSION_ENVIRONMENT_MISMATCH';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_validate_runbook_version_scope
ON knowledge.runbook_versions;


CREATE TRIGGER
    trg_validate_runbook_version_scope
BEFORE INSERT OR UPDATE OF
    runbook_definition_id,
    scope_type,
    organization_id,
    environment_id
ON knowledge.runbook_versions
FOR EACH ROW
EXECUTE FUNCTION
    knowledge.validate_runbook_version_scope();


-- ============================================================================
-- ONE ACTIVE VERSION PER DEFINITION
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_runbook_one_active_version
ON knowledge.runbook_versions (
    runbook_definition_id
)
WHERE lifecycle = 'ACTIVE';


-- ============================================================================
-- EXECUTION LOCK CONSISTENCY
-- ============================================================================

ALTER TABLE
    knowledge.runbook_versions
DROP CONSTRAINT IF EXISTS
    runbook_version_execution_lock_integrity;


ALTER TABLE
    knowledge.runbook_versions
ADD CONSTRAINT
    runbook_version_execution_lock_integrity
CHECK (
    first_executed_at IS NULL

    OR

    (
        immutable = true
        AND
        locked_at IS NOT NULL
    )
);


ALTER TABLE
    knowledge.runbook_versions
DROP CONSTRAINT IF EXISTS
    runbook_version_immutable_lock_integrity;


ALTER TABLE
    knowledge.runbook_versions
ADD CONSTRAINT
    runbook_version_immutable_lock_integrity
CHECK (
    immutable = false

    OR

    locked_at IS NOT NULL
);


-- ============================================================================
-- IMMUTABLE RUNBOOK CONTENT
--
-- Lifecycle is intentionally NOT part of the protected administrative fields.
--
-- Example:
--
-- ACTIVE → DEPRECATED
--
-- can still occur after execution.
--
-- However the exact runbook procedure that was executed can never change.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    knowledge.protect_locked_runbook_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

    IF OLD.immutable = true THEN

        IF
            NEW.runbook_definition_id
                IS DISTINCT FROM
            OLD.runbook_definition_id

            OR

            NEW.scope_type
                IS DISTINCT FROM
            OLD.scope_type

            OR

            NEW.organization_id
                IS DISTINCT FROM
            OLD.organization_id

            OR

            NEW.environment_id
                IS DISTINCT FROM
            OLD.environment_id

            OR

            NEW.semver
                IS DISTINCT FROM
            OLD.semver

            OR

            NEW.checksum
                IS DISTINCT FROM
            OLD.checksum

            OR

            NEW.definition
                IS DISTINCT FROM
            OLD.definition

            OR

            NEW.provenance
                IS DISTINCT FROM
            OLD.provenance

            OR

            NEW.safety
                IS DISTINCT FROM
            OLD.safety

            OR

            NEW.metadata
                IS DISTINCT FROM
            OLD.metadata

            OR

            NEW.published_at
                IS DISTINCT FROM
            OLD.published_at

        THEN
            RAISE EXCEPTION
                'RUNBOOK_VERSION_IMMUTABLE';
        END IF;


        IF
            NEW.immutable
                IS DISTINCT FROM
            OLD.immutable
        THEN
            RAISE EXCEPTION
                'RUNBOOK_VERSION_LOCK_CANNOT_BE_REMOVED';
        END IF;


        IF
            NEW.locked_at
                IS DISTINCT FROM
            OLD.locked_at
        THEN
            RAISE EXCEPTION
                'RUNBOOK_VERSION_LOCK_TIMESTAMP_IMMUTABLE';
        END IF;


        IF
            NEW.first_executed_at
                IS DISTINCT FROM
            OLD.first_executed_at
        THEN
            RAISE EXCEPTION
                'RUNBOOK_VERSION_EXECUTION_TIMESTAMP_IMMUTABLE';
        END IF;

    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_locked_runbook_version
ON knowledge.runbook_versions;


CREATE TRIGGER
    trg_protect_locked_runbook_version
BEFORE UPDATE
ON knowledge.runbook_versions
FOR EACH ROW
EXECUTE FUNCTION
    knowledge.protect_locked_runbook_version();


-- ============================================================================
-- EXECUTED VERSION DELETE PROTECTION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    knowledge.protect_executed_runbook_version_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

    IF
        OLD.immutable = true

        OR

        OLD.first_executed_at IS NOT NULL
    THEN
        RAISE EXCEPTION
            'RUNBOOK_VERSION_IMMUTABLE';
    END IF;


    RETURN OLD;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_executed_runbook_version_delete
ON knowledge.runbook_versions;


CREATE TRIGGER
    trg_protect_executed_runbook_version_delete
BEFORE DELETE
ON knowledge.runbook_versions
FOR EACH ROW
EXECUTE FUNCTION
    knowledge.protect_executed_runbook_version_delete();


COMMENT ON FUNCTION
    knowledge.protect_locked_runbook_version()
IS
    'Protects exact deterministic Runbook content after execution lock while allowing administrative lifecycle retirement.';


COMMENT ON FUNCTION
    knowledge.protect_executed_runbook_version_delete()
IS
    'Prevents deletion of Runbook versions that have ever been execution locked.';


COMMIT;