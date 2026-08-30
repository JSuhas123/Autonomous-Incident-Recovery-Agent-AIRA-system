-- ============================================================================
-- AIRA PHASE 20.18
-- INTEGRATION AUDIT / CONNECTION REFERENTIAL INTEGRITY
-- ============================================================================
--
-- Phase 20 invocation audit is immutable historical evidence.
--
-- Previous FK semantics used:
--
--   ON DELETE SET NULL
--
-- That conflicts with the append-only audit invariant because deleting a
-- connection attempts to UPDATE invocation_audit.connection_id.
--
-- Historical integration connections referenced by audit evidence must
-- therefore remain addressable.
--
-- Connection lifecycle retirement is performed through disabled status,
-- credential revocation and governance disablement rather than destructive
-- deletion after operational history exists.
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

ON DELETE RESTRICT;


COMMENT ON CONSTRAINT
    invocation_audit_connection_id_fkey
ON integrations.invocation_audit
IS
    'Immutable invocation audit preserves integration connection provenance; audited connections cannot be physically deleted.';