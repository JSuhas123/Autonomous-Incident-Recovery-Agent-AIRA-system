-- ============================================================================
-- AIRA PHASE 16.0 + 16.1
-- OPERATIONAL MEMORY & SYSTEM DNA FOUNDATION
--
-- PostgreSQL is the authoritative source of truth for AIRA memory.
--
-- Qdrant may later index memories for semantic retrieval, but:
--
--   Qdrant is NOT authoritative.
--   Qdrant does NOT own memory lifecycle.
--   Qdrant does NOT own tenant authorization.
--   Qdrant results MUST be hydrated and validated through PostgreSQL.
--
-- Memory hierarchy:
--
--   GLOBAL
--   TENANT
--     ENVIRONMENT
--       SERVICE
--       RESOURCE
--     INCIDENT
--
-- Canonical memory types:
--
--   EPISODIC
--   SEMANTIC
--   PROCEDURAL
--   OUTCOME
--   HUMAN
--   BEHAVIOURAL
--
-- ============================================================================
-- AIRA SYSTEM DNA INVARIANT
--
-- Memory may influence reasoning.
-- Memory never grants execution authority.
--
-- Existing authorization, policy, approval, entitlement and execution
-- controls remain authoritative.
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS memory;


-- ============================================================================
-- CANONICAL MEMORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory.memories (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    environment_id UUID
        REFERENCES tenancy.environments(id)
        ON DELETE RESTRICT,

    service_id TEXT,

    resource_id UUID
        REFERENCES resources.resources(id)
        ON DELETE SET NULL,

    incident_id UUID
        REFERENCES incidents.incidents(id)
        ON DELETE SET NULL,

    memory_type TEXT NOT NULL,

    scope_type TEXT NOT NULL,

    title TEXT,

    summary TEXT NOT NULL,

    content JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    confidence NUMERIC(6, 5) NOT NULL
        DEFAULT 0,

    trust_score NUMERIC(6, 5) NOT NULL
        DEFAULT 0,

    importance NUMERIC(6, 5) NOT NULL
        DEFAULT 0.5,

    status TEXT NOT NULL
        DEFAULT 'ACTIVE',

    source_type TEXT NOT NULL,

    source_count INTEGER NOT NULL
        DEFAULT 0,

    evidence_count INTEGER NOT NULL
        DEFAULT 0,

    observation_count INTEGER NOT NULL
        DEFAULT 1,

    observed_at TIMESTAMPTZ,

    valid_from TIMESTAMPTZ,

    valid_until TIMESTAMPTZ,

    supersedes_memory_id UUID
        REFERENCES memory.memories(id)
        ON DELETE RESTRICT,

    superseded_by_memory_id UUID
        REFERENCES memory.memories(id)
        ON DELETE RESTRICT,

    legacy_source_type TEXT,

    legacy_source_id TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    schema_version INTEGER NOT NULL
        DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT memory_public_id_unique
        UNIQUE (
            public_id
        ),

    CONSTRAINT memory_type_check
        CHECK (
            memory_type IN (
                'EPISODIC',
                'SEMANTIC',
                'PROCEDURAL',
                'OUTCOME',
                'HUMAN',
                'BEHAVIOURAL'
            )
        ),

    CONSTRAINT memory_scope_type_check
        CHECK (
            scope_type IN (
                'GLOBAL',
                'TENANT',
                'ENVIRONMENT',
                'SERVICE',
                'RESOURCE',
                'INCIDENT'
            )
        ),

    CONSTRAINT memory_status_check
        CHECK (
            status IN (
                'ACTIVE',
                'SUPERSEDED',
                'ARCHIVED',
                'INVALIDATED'
            )
        ),

    CONSTRAINT memory_confidence_range
        CHECK (
            confidence >= 0
            AND confidence <= 1
        ),

    CONSTRAINT memory_trust_score_range
        CHECK (
            trust_score >= 0
            AND trust_score <= 1
        ),

    CONSTRAINT memory_importance_range
        CHECK (
            importance >= 0
            AND importance <= 1
        ),

    CONSTRAINT memory_source_count_nonnegative
        CHECK (
            source_count >= 0
        ),

    CONSTRAINT memory_evidence_count_nonnegative
        CHECK (
            evidence_count >= 0
        ),

    CONSTRAINT memory_observation_count_positive
        CHECK (
            observation_count > 0
        ),

    CONSTRAINT memory_schema_version_positive
        CHECK (
            schema_version > 0
        ),

    CONSTRAINT memory_validity_range
        CHECK (
            valid_until IS NULL
            OR valid_from IS NULL
            OR valid_until > valid_from
        ),

    CONSTRAINT memory_no_self_supersede
        CHECK (
            supersedes_memory_id IS NULL
            OR supersedes_memory_id <> id
        ),

    CONSTRAINT memory_no_self_superseded_by
        CHECK (
            superseded_by_memory_id IS NULL
            OR superseded_by_memory_id <> id
        ),

    CONSTRAINT memory_global_scope_integrity
        CHECK (
            scope_type <> 'GLOBAL'
            OR (
                organization_id IS NULL
                AND environment_id IS NULL
                AND service_id IS NULL
                AND resource_id IS NULL
                AND incident_id IS NULL
            )
        ),

    CONSTRAINT memory_tenant_scope_integrity
        CHECK (
            scope_type <> 'TENANT'
            OR (
                organization_id IS NOT NULL
                AND environment_id IS NULL
                AND service_id IS NULL
                AND resource_id IS NULL
                AND incident_id IS NULL
            )
        ),

    CONSTRAINT memory_environment_scope_integrity
        CHECK (
            scope_type <> 'ENVIRONMENT'
            OR (
                organization_id IS NOT NULL
                AND environment_id IS NOT NULL
                AND service_id IS NULL
                AND resource_id IS NULL
                AND incident_id IS NULL
            )
        ),

    CONSTRAINT memory_service_scope_integrity
        CHECK (
            scope_type <> 'SERVICE'
            OR (
                organization_id IS NOT NULL
                AND environment_id IS NOT NULL
                AND service_id IS NOT NULL
                AND resource_id IS NULL
                AND incident_id IS NULL
            )
        ),

    CONSTRAINT memory_resource_scope_integrity
        CHECK (
            scope_type <> 'RESOURCE'
            OR (
                organization_id IS NOT NULL
                AND environment_id IS NOT NULL
                AND resource_id IS NOT NULL
                AND incident_id IS NULL
            )
        ),

    CONSTRAINT memory_incident_scope_integrity
        CHECK (
            scope_type <> 'INCIDENT'
            OR (
                organization_id IS NOT NULL
                AND environment_id IS NOT NULL
                AND incident_id IS NOT NULL
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_memories_organization
ON memory.memories (
    organization_id,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_memories_environment
ON memory.memories (
    organization_id,
    environment_id,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_memories_type
ON memory.memories (
    organization_id,
    memory_type,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_memories_service
ON memory.memories (
    organization_id,
    environment_id,
    service_id,
    status
)
WHERE service_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_memories_resource
ON memory.memories (
    resource_id,
    status
)
WHERE resource_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_memories_incident
ON memory.memories (
    incident_id,
    memory_type,
    status
)
WHERE incident_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_memories_legacy_source
ON memory.memories (
    legacy_source_type,
    legacy_source_id
)
WHERE legacy_source_id IS NOT NULL;


-- ============================================================================
-- MEMORY SOURCES
--
-- Every important memory should retain provenance.
--
-- Examples:
--
--   INCIDENT
--   SIGNAL
--   DIAGNOSIS
--   EXECUTION
--   VERIFICATION
--   HUMAN_FEEDBACK
--   TELEMETRY
--   PLAYBOOK
--   RUNBOOK
--   LEGACY_INCIDENT_MEMORY
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory.memory_sources (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    memory_id UUID NOT NULL
        REFERENCES memory.memories(id)
        ON DELETE CASCADE,

    organization_id UUID
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    source_type TEXT NOT NULL,

    source_id TEXT NOT NULL,

    source_version TEXT,

    source_uri TEXT,

    evidence_role TEXT NOT NULL
        DEFAULT 'SUPPORTING',

    observed_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT memory_source_unique
        UNIQUE (
            memory_id,
            source_type,
            source_id
        ),

    CONSTRAINT memory_source_evidence_role_check
        CHECK (
            evidence_role IN (
                'PRIMARY',
                'SUPPORTING',
                'CONTRADICTING',
                'HUMAN_CONFIRMED',
                'HUMAN_REJECTED'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_memory_sources_memory
ON memory.memory_sources (
    memory_id,
    created_at
);


CREATE INDEX IF NOT EXISTS
    idx_memory_sources_lookup
ON memory.memory_sources (
    organization_id,
    source_type,
    source_id
);


-- ============================================================================
-- MEMORY RELATIONS
--
-- Relations allow AIRA to represent relationships between memories without
-- collapsing all knowledge into a single record.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory.memory_relations (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    from_memory_id UUID NOT NULL
        REFERENCES memory.memories(id)
        ON DELETE CASCADE,

    to_memory_id UUID NOT NULL
        REFERENCES memory.memories(id)
        ON DELETE CASCADE,

    relation_type TEXT NOT NULL,

    confidence NUMERIC(6, 5) NOT NULL
        DEFAULT 1,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT memory_relation_unique
        UNIQUE (
            from_memory_id,
            to_memory_id,
            relation_type
        ),

    CONSTRAINT memory_relation_no_self_reference
        CHECK (
            from_memory_id <> to_memory_id
        ),

    CONSTRAINT memory_relation_confidence_range
        CHECK (
            confidence >= 0
            AND confidence <= 1
        ),

    CONSTRAINT memory_relation_type_check
        CHECK (
            relation_type IN (
                'DERIVED_FROM',
                'SUPPORTS',
                'CONTRADICTS',
                'CAUSES',
                'PRECEDES',
                'FOLLOWS',
                'RESULTED_IN',
                'RESOLVED_BY',
                'SIMILAR_TO',
                'SUPERSEDES'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_memory_relations_from
ON memory.memory_relations (
    from_memory_id,
    relation_type
);


CREATE INDEX IF NOT EXISTS
    idx_memory_relations_to
ON memory.memory_relations (
    to_memory_id,
    relation_type
);


-- ============================================================================
-- MEMORY VERSIONS
--
-- Memory history is append-only here.
--
-- Updates to a canonical memory may create version snapshots so AIRA can
-- explain what it believed previously and why that belief changed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory.memory_versions (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    memory_id UUID NOT NULL
        REFERENCES memory.memories(id)
        ON DELETE RESTRICT,

    organization_id UUID
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    version INTEGER NOT NULL,

    memory_type TEXT NOT NULL,

    scope_type TEXT NOT NULL,

    title TEXT,

    summary TEXT NOT NULL,

    content JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    confidence NUMERIC(6, 5) NOT NULL,

    trust_score NUMERIC(6, 5) NOT NULL,

    importance NUMERIC(6, 5) NOT NULL,

    status TEXT NOT NULL,

    change_reason TEXT NOT NULL,

    changed_by_type TEXT NOT NULL,

    changed_by_id TEXT,

    snapshot JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT memory_version_unique
        UNIQUE (
            memory_id,
            version
        ),

    CONSTRAINT memory_version_positive
        CHECK (
            version > 0
        ),

    CONSTRAINT memory_version_confidence_range
        CHECK (
            confidence >= 0
            AND confidence <= 1
        ),

    CONSTRAINT memory_version_trust_range
        CHECK (
            trust_score >= 0
            AND trust_score <= 1
        ),

    CONSTRAINT memory_version_importance_range
        CHECK (
            importance >= 0
            AND importance <= 1
        )
);


CREATE INDEX IF NOT EXISTS
    idx_memory_versions_memory
ON memory.memory_versions (
    memory_id,
    version DESC
);


-- ============================================================================
-- TENANT / ENVIRONMENT CONSISTENCY
--
-- RLS protects request scope.
--
-- These triggers additionally ensure an environment/resource/incident cannot
-- be attached to a memory belonging to another organization/environment.
-- ============================================================================

CREATE OR REPLACE FUNCTION memory.validate_memory_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_environment_org UUID;
    resolved_resource_org UUID;
    resolved_resource_environment UUID;
    resolved_incident_org UUID;
    resolved_incident_environment UUID;
BEGIN

    IF NEW.environment_id IS NOT NULL THEN

        SELECT
            organization_id
        INTO
            resolved_environment_org
        FROM tenancy.environments
        WHERE id = NEW.environment_id;


        IF resolved_environment_org IS NULL THEN
            RAISE EXCEPTION
                'MEMORY_ENVIRONMENT_NOT_FOUND';
        END IF;


        IF
            NEW.organization_id IS NULL
            OR resolved_environment_org <> NEW.organization_id
        THEN
            RAISE EXCEPTION
                'MEMORY_ORGANIZATION_ENVIRONMENT_SCOPE_MISMATCH';
        END IF;

    END IF;


    IF NEW.resource_id IS NOT NULL THEN

        SELECT
            organization_id,
            environment_id
        INTO
            resolved_resource_org,
            resolved_resource_environment
        FROM resources.resources
        WHERE id = NEW.resource_id;


        IF resolved_resource_org IS NULL THEN
            RAISE EXCEPTION
                'MEMORY_RESOURCE_NOT_FOUND';
        END IF;


        IF
            NEW.organization_id IS NULL
            OR resolved_resource_org <> NEW.organization_id
        THEN
            RAISE EXCEPTION
                'MEMORY_ORGANIZATION_RESOURCE_SCOPE_MISMATCH';
        END IF;


        IF
            NEW.environment_id IS NOT NULL
            AND resolved_resource_environment <> NEW.environment_id
        THEN
            RAISE EXCEPTION
                'MEMORY_ENVIRONMENT_RESOURCE_SCOPE_MISMATCH';
        END IF;

    END IF;


    IF NEW.incident_id IS NOT NULL THEN

        SELECT
            organization_id,
            environment_id
        INTO
            resolved_incident_org,
            resolved_incident_environment
        FROM incidents.incidents
        WHERE id = NEW.incident_id;


        IF resolved_incident_org IS NULL THEN
            RAISE EXCEPTION
                'MEMORY_INCIDENT_NOT_FOUND';
        END IF;


        IF
            NEW.organization_id IS NULL
            OR resolved_incident_org <> NEW.organization_id
        THEN
            RAISE EXCEPTION
                'MEMORY_ORGANIZATION_INCIDENT_SCOPE_MISMATCH';
        END IF;


        IF
            NEW.environment_id IS NOT NULL
            AND resolved_incident_environment <> NEW.environment_id
        THEN
            RAISE EXCEPTION
                'MEMORY_ENVIRONMENT_INCIDENT_SCOPE_MISMATCH';
        END IF;

    END IF;


    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_validate_memory_scope
ON memory.memories;


CREATE TRIGGER
    trg_validate_memory_scope
BEFORE INSERT OR UPDATE
ON memory.memories
FOR EACH ROW
EXECUTE FUNCTION
    memory.validate_memory_scope();


-- ============================================================================
-- ROW LEVEL SECURITY
--
-- GLOBAL memories:
--
--   organization_id IS NULL
--
-- Tenant memories:
--
--   organization_id must equal current AIRA organization context.
--
-- GLOBAL writes are intentionally NOT granted through the normal tenant
-- policy. A later controlled knowledge-governance path will own global-memory
-- creation.
--
-- IMPORTANT MIGRATION SAFETY:
--
-- PostgreSQL does not support CREATE POLICY IF NOT EXISTS.
--
-- Phase 16.1 may have been applied manually in development before being
-- adopted by the canonical migration runner.
--
-- Therefore each policy is explicitly dropped and recreated.
--
-- This makes 0060 safely rerunnable without dropping memory data.
-- ============================================================================


ALTER TABLE memory.memories
    ENABLE ROW LEVEL SECURITY;


ALTER TABLE memory.memories
    FORCE ROW LEVEL SECURITY;


ALTER TABLE memory.memory_sources
    ENABLE ROW LEVEL SECURITY;


ALTER TABLE memory.memory_sources
    FORCE ROW LEVEL SECURITY;


ALTER TABLE memory.memory_relations
    ENABLE ROW LEVEL SECURITY;


ALTER TABLE memory.memory_relations
    FORCE ROW LEVEL SECURITY;


ALTER TABLE memory.memory_versions
    ENABLE ROW LEVEL SECURITY;


ALTER TABLE memory.memory_versions
    FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- MEMORY READ POLICY
-- ============================================================================

DROP POLICY IF EXISTS
    memory_memories_read_policy
ON memory.memories;


CREATE POLICY
    memory_memories_read_policy
ON memory.memories
FOR SELECT
USING (
    organization_id IS NULL
    OR organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- MEMORY WRITE POLICY
-- ============================================================================

DROP POLICY IF EXISTS
    memory_memories_write_policy
ON memory.memories;


CREATE POLICY
    memory_memories_write_policy
ON memory.memories
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- MEMORY SOURCE POLICY
-- ============================================================================

DROP POLICY IF EXISTS
    memory_sources_scope_policy
ON memory.memory_sources;


CREATE POLICY
    memory_sources_scope_policy
ON memory.memory_sources
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- MEMORY RELATION POLICY
-- ============================================================================

DROP POLICY IF EXISTS
    memory_relations_scope_policy
ON memory.memory_relations;


CREATE POLICY
    memory_relations_scope_policy
ON memory.memory_relations
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- MEMORY VERSION POLICY
-- ============================================================================

DROP POLICY IF EXISTS
    memory_versions_scope_policy
ON memory.memory_versions;


CREATE POLICY
    memory_versions_scope_policy
ON memory.memory_versions
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- DOCUMENTATION / ARCHITECTURAL INVARIANTS
-- ============================================================================

COMMENT ON SCHEMA memory IS
    'AIRA Operational Memory and System DNA. PostgreSQL is authoritative; vector databases are retrieval indexes only.';


COMMENT ON TABLE memory.memories IS
    'Authoritative canonical AIRA operational memories. Qdrant may reference these rows by memory ID but never replaces them as truth.';


COMMENT ON TABLE memory.memory_sources IS
    'Provenance ledger linking canonical memories to incidents, executions, telemetry, humans and other evidence sources.';


COMMENT ON TABLE memory.memory_relations IS
    'Typed relationships between canonical operational memories.';


COMMENT ON TABLE memory.memory_versions IS
    'Historical snapshots of canonical memory state for explainability, auditability and supersession.';


COMMENT ON COLUMN memory.memories.organization_id IS
    'Tenant boundary. NULL is permitted only for GLOBAL knowledge.';


COMMENT ON COLUMN memory.memories.confidence IS
    'Confidence that the represented operational knowledge is correct, normalized to [0,1].';


COMMENT ON COLUMN memory.memories.trust_score IS
    'Trust assigned from provenance, confirmation and outcomes, normalized to [0,1].';


COMMENT ON COLUMN memory.memories.importance IS
    'Operational importance used later for retrieval/ranking, normalized to [0,1].';


COMMENT ON COLUMN memory.memories.supersedes_memory_id IS
    'Older memory explicitly replaced by this memory without deleting historical knowledge.';