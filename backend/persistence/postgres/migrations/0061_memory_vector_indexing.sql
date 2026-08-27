-- ============================================================================
-- AIRA PHASE 16.5 + 16.6
-- MEMORY VECTOR INDEXING / EMBEDDING PIPELINE
--
-- PostgreSQL remains authoritative.
--
-- Qdrant stores:
--
--   vector
--   canonical memory ID
--   tenant/scope metadata
--
-- Qdrant never owns:
--
--   memory content authority
--   lifecycle
--   provenance
--   authorization
--   tenant truth
--
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS memory;


-- ============================================================================
-- EMBEDDING RECORDS
--
-- Authoritative record of what representation of a canonical memory has been
-- embedded and indexed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory.embedding_records (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    memory_id UUID NOT NULL
        REFERENCES memory.memories(id)
        ON DELETE CASCADE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    embedding_provider TEXT NOT NULL,

    embedding_model TEXT NOT NULL,

    embedding_version INTEGER NOT NULL,

    dimensions INTEGER NOT NULL,

    content_hash TEXT NOT NULL,

    retrieval_text_hash TEXT NOT NULL,

    qdrant_collection TEXT NOT NULL,

    qdrant_point_id TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'PENDING',

    indexed_at TIMESTAMPTZ,

    failed_at TIMESTAMPTZ,

    failure_code TEXT,

    failure_message TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT embedding_record_unique
        UNIQUE (
            memory_id,
            embedding_provider,
            embedding_model,
            embedding_version
        ),

    CONSTRAINT embedding_qdrant_point_unique
        UNIQUE (
            qdrant_collection,
            qdrant_point_id
        ),

    CONSTRAINT embedding_version_positive
        CHECK (
            embedding_version > 0
        ),

    CONSTRAINT embedding_dimensions_positive
        CHECK (
            dimensions > 0
        ),

    CONSTRAINT embedding_status_check
        CHECK (
            status IN (
                'PENDING',
                'INDEXED',
                'STALE',
                'FAILED',
                'DELETED'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_embedding_records_memory
ON memory.embedding_records (
    memory_id,
    status,
    updated_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_embedding_records_org
ON memory.embedding_records (
    organization_id,
    status,
    updated_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_embedding_records_stale
ON memory.embedding_records (
    status,
    updated_at
)
WHERE status IN (
    'PENDING',
    'STALE',
    'FAILED'
);


-- ============================================================================
-- INDEX OPERATIONS
--
-- Durable audit/outbox for Qdrant index mutations.
--
-- If AIRA crashes after PostgreSQL state changes but before Qdrant succeeds,
-- this table allows safe retry/reconciliation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory.index_operations (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    operation_code TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    memory_id UUID NOT NULL
        REFERENCES memory.memories(id)
        ON DELETE CASCADE,

    embedding_record_id UUID
        REFERENCES memory.embedding_records(id)
        ON DELETE SET NULL,

    operation_type TEXT NOT NULL,

    qdrant_collection TEXT NOT NULL,

    qdrant_point_id TEXT NOT NULL,

    idempotency_key TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'PENDING',

    attempt_count INTEGER NOT NULL
        DEFAULT 0,

    processing_started_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,

    failed_at TIMESTAMPTZ,

    failure_code TEXT,

    failure_message TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT memory_index_operation_code_unique
        UNIQUE (
            operation_code
        ),

    CONSTRAINT memory_index_operation_idempotency_unique
        UNIQUE (
            idempotency_key
        ),

    CONSTRAINT memory_index_operation_type_check
        CHECK (
            operation_type IN (
                'UPSERT',
                'DELETE'
            )
        ),

    CONSTRAINT memory_index_operation_status_check
        CHECK (
            status IN (
                'PENDING',
                'PROCESSING',
                'COMPLETED',
                'FAILED'
            )
        ),

    CONSTRAINT memory_index_operation_attempt_nonnegative
        CHECK (
            attempt_count >= 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_memory_index_operations_pending
ON memory.index_operations (
    status,
    created_at
)
WHERE status IN (
    'PENDING',
    'FAILED'
);


CREATE INDEX IF NOT EXISTS
    idx_memory_index_operations_memory
ON memory.index_operations (
    memory_id,
    created_at DESC
);


-- ============================================================================
-- TENANT SECURITY
-- ============================================================================

ALTER TABLE memory.embedding_records
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE memory.embedding_records
    FORCE ROW LEVEL SECURITY;


ALTER TABLE memory.index_operations
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE memory.index_operations
    FORCE ROW LEVEL SECURITY;


CREATE POLICY memory_embedding_records_scope_policy
ON memory.embedding_records
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


CREATE POLICY memory_index_operations_scope_policy
ON memory.index_operations
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- UPDATED-AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_embedding_records_updated_at
ON memory.embedding_records;


CREATE TRIGGER
    trg_embedding_records_updated_at
BEFORE UPDATE
ON memory.embedding_records
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_index_operations_updated_at
ON memory.index_operations;


CREATE TRIGGER
    trg_index_operations_updated_at
BEFORE UPDATE
ON memory.index_operations
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE memory.embedding_records IS
    'PostgreSQL-authoritative record of canonical AIRA memory embeddings and Qdrant indexing state. No vector is authoritative here or in Qdrant.';


COMMENT ON TABLE memory.index_operations IS
    'Durable idempotent outbox/audit of Qdrant memory index mutations.';


COMMENT ON COLUMN memory.embedding_records.qdrant_point_id IS
    'Stable Qdrant point identifier derived from the canonical PostgreSQL memory UUID.';


COMMENT ON COLUMN memory.embedding_records.content_hash IS
    'Hash used to detect canonical memory changes requiring re-embedding.';


COMMENT ON COLUMN memory.embedding_records.retrieval_text_hash IS
    'Hash of the exact normalized retrieval representation embedded for Qdrant.';