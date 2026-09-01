BEGIN;


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
ON DELETE RESTRICT;


COMMIT;