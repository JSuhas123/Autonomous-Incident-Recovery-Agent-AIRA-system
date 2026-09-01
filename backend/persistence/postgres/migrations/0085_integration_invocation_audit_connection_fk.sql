BEGIN;


-- ============================================================================
-- AIRA Phase 21.16
--
-- Restore the intended lifecycle relationship between:
--
-- integrations.invocation_audit.connection_id
--                  ->
-- integrations.connections.id
--
-- Invocation audit is historical evidence and must survive connection removal.
--
-- Therefore deleting a temporary/revoked integration connection must SET NULL
-- on the audit FK rather than reject the deletion.
--
-- Audit rows themselves remain immutable.
-- ============================================================================


ALTER TABLE
    integrations.invocation_audit
DROP CONSTRAINT IF EXISTS
    invocation_audit_connection_id_fkey;


ALTER TABLE
    integrations.invocation_audit
ADD CONSTRAINT
    invocation_audit_connection_id_fkey
FOREIGN KEY (
    connection_id
)
REFERENCES
    integrations.connections(id)
ON DELETE SET NULL;


-- ============================================================================
-- SAFETY VERIFICATION
-- ============================================================================

DO $$
DECLARE
    delete_action "char";
BEGIN
    SELECT
        confdeltype
    INTO
        delete_action
    FROM
        pg_constraint
    WHERE
        conname =
            'invocation_audit_connection_id_fkey'
        AND conrelid =
            'integrations.invocation_audit'::regclass;


    IF
        delete_action IS DISTINCT FROM
        'n'
    THEN
        RAISE EXCEPTION
            'invocation_audit_connection_id_fkey must use ON DELETE SET NULL';
    END IF;
END;
$$;


COMMIT;