BEGIN;


-- ============================================================================
-- PHASE 18.4
-- PLAYBOOK DEFINITION + IMMUTABLE VERSION INTEGRITY
--
-- Invariants:
--
-- 1. PlaybookDefinition owns stable logical identity.
-- 2. PlaybookVersion owns versioned operational content.
-- 3. Version scope must exactly match its Definition scope.
-- 4. Only one ACTIVE version may exist per Definition.
-- 5. Once a version is execution-locked, operational content is immutable.
-- 6. An executed version can never be deleted.
-- 7. Lifecycle administration may continue after locking.
-- 8. Knowledge never grants execution permission.
-- ============================================================================


-- ============================================================================
-- VERSION / DEFINITION SCOPE CONSISTENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    knowledge.validate_playbook_version_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    definition_row
        knowledge.playbook_definitions%ROWTYPE;
BEGIN
    SELECT *
    INTO definition_row
    FROM knowledge.playbook_definitions
    WHERE id =
        NEW.playbook_definition_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'PLAYBOOK_DEFINITION_NOT_FOUND'
            USING ERRCODE = '23503';
    END IF;


    IF
        NEW.scope_type IS DISTINCT FROM
            definition_row.scope_type
    THEN
        RAISE EXCEPTION
            'PLAYBOOK_VERSION_SCOPE_MISMATCH';
    END IF;


    IF
        NEW.organization_id IS DISTINCT FROM
            definition_row.organization_id
    THEN
        RAISE EXCEPTION
            'PLAYBOOK_VERSION_ORGANIZATION_MISMATCH';
    END IF;


    IF
        NEW.environment_id IS DISTINCT FROM
            definition_row.environment_id
    THEN
        RAISE EXCEPTION
            'PLAYBOOK_VERSION_ENVIRONMENT_MISMATCH';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_validate_playbook_version_scope
ON knowledge.playbook_versions;


CREATE TRIGGER
    trg_validate_playbook_version_scope
BEFORE INSERT OR UPDATE OF
    playbook_definition_id,
    scope_type,
    organization_id,
    environment_id
ON knowledge.playbook_versions
FOR EACH ROW
EXECUTE FUNCTION
    knowledge.validate_playbook_version_scope();


-- ============================================================================
-- ONE ACTIVE VERSION PER PLAYBOOK DEFINITION
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_playbook_one_active_version
ON knowledge.playbook_versions (
    playbook_definition_id
)
WHERE lifecycle = 'ACTIVE';


-- ============================================================================
-- EXECUTION LOCK CONSISTENCY
-- ============================================================================

ALTER TABLE
    knowledge.playbook_versions
DROP CONSTRAINT IF EXISTS
    playbook_version_execution_lock_integrity;


ALTER TABLE
    knowledge.playbook_versions
ADD CONSTRAINT
    playbook_version_execution_lock_integrity
CHECK (
    first_executed_at IS NULL
    OR
    (
        immutable = true
        AND locked_at IS NOT NULL
    )
);


ALTER TABLE
    knowledge.playbook_versions
DROP CONSTRAINT IF EXISTS
    playbook_version_immutable_lock_integrity;


ALTER TABLE
    knowledge.playbook_versions
ADD CONSTRAINT
    playbook_version_immutable_lock_integrity
CHECK (
    immutable = false
    OR
    locked_at IS NOT NULL
);


-- ============================================================================
-- IMMUTABLE OPERATIONAL CONTENT
--
-- Lifecycle is intentionally excluded.
--
-- Example:
--
-- ACTIVE → DEPRECATED
--
-- must remain possible after execution.
--
-- The actual executed Playbook content may never change.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    knowledge.protect_locked_playbook_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN

    IF OLD.immutable = true THEN

        IF
            NEW.playbook_definition_id
                IS DISTINCT FROM
            OLD.playbook_definition_id

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
                'PLAYBOOK_VERSION_IMMUTABLE';
        END IF;


        IF
            NEW.immutable
                IS DISTINCT FROM
            OLD.immutable
        THEN
            RAISE EXCEPTION
                'PLAYBOOK_VERSION_LOCK_CANNOT_BE_REMOVED';
        END IF;


        IF
            NEW.locked_at
                IS DISTINCT FROM
            OLD.locked_at
        THEN
            RAISE EXCEPTION
                'PLAYBOOK_VERSION_LOCK_TIMESTAMP_IMMUTABLE';
        END IF;


        IF
            NEW.first_executed_at
                IS DISTINCT FROM
            OLD.first_executed_at
        THEN
            RAISE EXCEPTION
                'PLAYBOOK_VERSION_EXECUTION_TIMESTAMP_IMMUTABLE';
        END IF;

    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_locked_playbook_version
ON knowledge.playbook_versions;


CREATE TRIGGER
    trg_protect_locked_playbook_version
BEFORE UPDATE
ON knowledge.playbook_versions
FOR EACH ROW
EXECUTE FUNCTION
    knowledge.protect_locked_playbook_version();


-- ============================================================================
-- DELETE PROTECTION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    knowledge.protect_executed_playbook_version_delete()
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
            'PLAYBOOK_VERSION_IMMUTABLE';
    END IF;


    RETURN OLD;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_executed_playbook_version_delete
ON knowledge.playbook_versions;


CREATE TRIGGER
    trg_protect_executed_playbook_version_delete
BEFORE DELETE
ON knowledge.playbook_versions
FOR EACH ROW
EXECUTE FUNCTION
    knowledge.protect_executed_playbook_version_delete();


COMMENT ON FUNCTION
    knowledge.protect_locked_playbook_version()
IS
    'Prevents mutation of operational Playbook content after execution lock while permitting lifecycle retirement.';


COMMENT ON FUNCTION
    knowledge.protect_executed_playbook_version_delete()
IS
    'Prevents deletion of Playbook versions that have been locked/executed.';


COMMIT;