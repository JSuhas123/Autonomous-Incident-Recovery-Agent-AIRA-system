BEGIN;


-- ============================================================================
-- AIRA PHASE 16.14
-- MEMORY LIFECYCLE STATUS ALIGNMENT
--
-- Historical Phase 16 schema:
--
--   ACTIVE
--   SUPERSEDED
--   ARCHIVED
--   INVALIDATED
--
-- Phase 16.14 introduces two explicit lifecycle states:
--
--   STALE
--   REVOKED
--
-- INVALIDATED remains supported for backward compatibility.
-- ============================================================================


ALTER TABLE
    memory.memories
DROP CONSTRAINT IF EXISTS
    memory_status_check;


ALTER TABLE
    memory.memories
ADD CONSTRAINT
    memory_status_check
CHECK (
    status IN (
        'ACTIVE',
        'STALE',
        'SUPERSEDED',
        'ARCHIVED',
        'REVOKED',
        'INVALIDATED'
    )
);


COMMENT ON COLUMN
    memory.memories.status
IS
    'Memory lifecycle state. ACTIVE is retrieval eligible. '
    'STALE is temporarily excluded pending revalidation. '
    'SUPERSEDED has newer authoritative knowledge. '
    'ARCHIVED is intentionally retired. '
    'REVOKED is explicitly unsafe or invalid knowledge. '
    'INVALIDATED is retained for backward compatibility.';


COMMIT;