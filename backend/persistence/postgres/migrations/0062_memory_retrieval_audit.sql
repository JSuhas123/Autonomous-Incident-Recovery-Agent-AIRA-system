-- ============================================================================
-- AIRA PHASE 16.7
-- MEMORY RETRIEVAL / HYDRATION AUDIT
--
-- Qdrant returns retrieval candidates.
--
-- PostgreSQL remains authoritative and decides which candidates are valid,
-- active and visible to the requesting tenant.
--
-- This audit records:
--
--   query identity
--   embedding configuration
--   candidate count
--   hydrated count
--   rejected count
--   scope/type restrictions
--   retrieval result status
--
-- It deliberately does NOT store the raw embedding vector.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS memory;


CREATE TABLE IF NOT EXISTS memory.retrieval_audit (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    retrieval_code TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    environment_id UUID
        REFERENCES tenancy.environments(id)
        ON DELETE SET NULL,

    query_hash TEXT NOT NULL,

    query_length INTEGER NOT NULL,

    embedding_provider TEXT NOT NULL,

    embedding_model TEXT NOT NULL,

    embedding_version INTEGER NOT NULL,

    dimensions INTEGER NOT NULL,

    qdrant_collection TEXT NOT NULL,

    requested_memory_types JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    requested_scopes JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    include_global BOOLEAN NOT NULL
        DEFAULT FALSE,

    requested_limit INTEGER NOT NULL,

    candidate_count INTEGER NOT NULL
        DEFAULT 0,

    hydrated_count INTEGER NOT NULL
        DEFAULT 0,

    rejected_count INTEGER NOT NULL
        DEFAULT 0,

    status TEXT NOT NULL
        DEFAULT 'STARTED',

    failure_code TEXT,

    failure_message TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    started_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    completed_at TIMESTAMPTZ,

    CONSTRAINT memory_retrieval_code_unique
        UNIQUE (
            retrieval_code
        ),

    CONSTRAINT memory_retrieval_query_length_positive
        CHECK (
            query_length > 0
        ),

    CONSTRAINT memory_retrieval_embedding_version_positive
        CHECK (
            embedding_version > 0
        ),

    CONSTRAINT memory_retrieval_dimensions_positive
        CHECK (
            dimensions > 0
        ),

    CONSTRAINT memory_retrieval_limit_positive
        CHECK (
            requested_limit > 0
        ),

    CONSTRAINT memory_retrieval_candidate_nonnegative
        CHECK (
            candidate_count >= 0
        ),

    CONSTRAINT memory_retrieval_hydrated_nonnegative
        CHECK (
            hydrated_count >= 0
        ),

    CONSTRAINT memory_retrieval_rejected_nonnegative
        CHECK (
            rejected_count >= 0
        ),

    CONSTRAINT memory_retrieval_status_check
        CHECK (
            status IN (
                'STARTED',
                'COMPLETED',
                'FAILED'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_memory_retrieval_audit_org
ON memory.retrieval_audit (
    organization_id,
    started_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_memory_retrieval_audit_status
ON memory.retrieval_audit (
    status,
    started_at DESC
);


ALTER TABLE memory.retrieval_audit
    ENABLE ROW LEVEL SECURITY;


ALTER TABLE memory.retrieval_audit
    FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    memory_retrieval_audit_scope_policy
ON memory.retrieval_audit;


CREATE POLICY
    memory_retrieval_audit_scope_policy
ON memory.retrieval_audit
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


COMMENT ON TABLE memory.retrieval_audit IS
    'Auditable record of Qdrant memory retrieval candidates and PostgreSQL-authorized hydration results.';


COMMENT ON COLUMN memory.retrieval_audit.candidate_count IS
    'Number of vector candidates returned by Qdrant before PostgreSQL authorization/hydration.';


COMMENT ON COLUMN memory.retrieval_audit.hydrated_count IS
    'Number of canonical PostgreSQL memories accepted after lifecycle and tenant scope validation.';


COMMENT ON COLUMN memory.retrieval_audit.rejected_count IS
    'Candidates discarded during PostgreSQL hydration or scope validation.';