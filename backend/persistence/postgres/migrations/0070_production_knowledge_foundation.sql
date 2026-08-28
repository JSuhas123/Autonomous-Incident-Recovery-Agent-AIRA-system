BEGIN;


-- ============================================================================
-- PHASE 18 — PRODUCTION PLAYBOOK + RUNBOOK KNOWLEDGE SYSTEM
-- MIGRATION 0070 — CANONICAL POSTGRESQL KNOWLEDGE FOUNDATION
--
-- PostgreSQL
--   = canonical operational knowledge
--
-- YAML/domain packs
--   = authoring/import sources
--
-- Qdrant
--   = optional retrieval projection only
--
-- MongoDB/Mongoose
--   = legacy Phase 18 knowledge persistence to be retired
--
-- Knowledge never authorizes execution.
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS knowledge;


-- ============================================================================
-- DOMAIN REGISTRY
--
-- This is global platform taxonomy.
-- It is not tenant-owned knowledge.
--
-- Future domains may be inserted without changing the Knowledge Engine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    knowledge.domains (
        domain_key text PRIMARY KEY,

        display_name text NOT NULL,

        description text NULL,

        status text NOT NULL
            DEFAULT 'ACTIVE',

        metadata jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        updated_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT knowledge_domains_key_format
            CHECK (
                domain_key ~
                '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$'
            ),

        CONSTRAINT knowledge_domains_status
            CHECK (
                status IN (
                    'ACTIVE',
                    'DEPRECATED',
                    'RETIRED'
                )
            )
    );


INSERT INTO
    knowledge.domains (
        domain_key,
        display_name
    )
VALUES
    ('kubernetes', 'Kubernetes'),

    ('containers', 'Containers'),

    ('linux', 'Linux'),

    (
        'database.postgres',
        'PostgreSQL'
    ),

    (
        'database.mysql',
        'MySQL'
    ),

    (
        'database.mongodb',
        'MongoDB'
    ),

    (
        'database.redis',
        'Redis'
    ),

    (
        'messaging.kafka',
        'Apache Kafka'
    ),

    (
        'messaging.rabbitmq',
        'RabbitMQ'
    ),

    ('network', 'Networking'),

    ('dns', 'DNS'),

    ('storage', 'Storage'),

    ('cloud.aws', 'AWS'),

    ('cloud.azure', 'Microsoft Azure'),

    ('cloud.gcp', 'Google Cloud Platform'),

    ('observability', 'Observability'),

    ('cicd', 'CI/CD'),

    ('security', 'Security'),

    ('application', 'Applications')

ON CONFLICT (
    domain_key
)
DO NOTHING;


-- ============================================================================
-- FAILURE MODE DEFINITIONS
--
-- Stable identity for a FailureMode.
--
-- The mutable/display identity lives here.
-- Versioned operational knowledge belongs in failure_mode_versions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    knowledge.failure_mode_definitions (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        failure_mode_key text NOT NULL,

        legacy_mongo_id text NULL UNIQUE,

        scope_type text NOT NULL,

        organization_id uuid NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        domain_key text NOT NULL
            REFERENCES knowledge.domains(domain_key)
            ON DELETE RESTRICT,

        name text NOT NULL,

        description text NOT NULL,

        status text NOT NULL
            DEFAULT 'ACTIVE',

        metadata jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        updated_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT failure_mode_key_format
            CHECK (
                failure_mode_key ~
                '^FM-[A-Z0-9]+(?:-[A-Z0-9]+)+$'
            ),

        CONSTRAINT failure_mode_definition_scope_type
            CHECK (
                scope_type IN (
                    'GLOBAL',
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT failure_mode_definition_scope_integrity
            CHECK (
                (
                    scope_type = 'GLOBAL'
                    AND organization_id IS NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ORGANIZATION'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ENVIRONMENT'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NOT NULL
                )
            ),

        CONSTRAINT failure_mode_definition_status
            CHECK (
                status IN (
                    'ACTIVE',
                    'DEPRECATED',
                    'RETIRED'
                )
            )
    );


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_failure_mode_global_key
ON knowledge.failure_mode_definitions (
    failure_mode_key
)
WHERE
    scope_type = 'GLOBAL';


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_failure_mode_org_key
ON knowledge.failure_mode_definitions (
    organization_id,
    failure_mode_key
)
WHERE
    scope_type = 'ORGANIZATION';


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_failure_mode_environment_key
ON knowledge.failure_mode_definitions (
    organization_id,
    environment_id,
    failure_mode_key
)
WHERE
    scope_type = 'ENVIRONMENT';


CREATE INDEX IF NOT EXISTS
    idx_failure_mode_domain
ON knowledge.failure_mode_definitions (
    domain_key,
    status
);


CREATE INDEX IF NOT EXISTS
    idx_failure_mode_scope
ON knowledge.failure_mode_definitions (
    organization_id,
    environment_id,
    status
);


-- ============================================================================
-- FAILURE MODE VERSIONS
--
-- Versioned knowledge payload.
--
-- Immutability/publishing enforcement is hardened in the later Phase 18
-- versioning stages. 0070 establishes the canonical persistence destination.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    knowledge.failure_mode_versions (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        failure_mode_definition_id uuid NOT NULL
            REFERENCES knowledge.failure_mode_definitions(id)
            ON DELETE RESTRICT,

        scope_type text NOT NULL,

        organization_id uuid NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        semver text NOT NULL,

        severity text NOT NULL,

        lifecycle text NOT NULL
            DEFAULT 'DRAFT',

        resource_types text[] NOT NULL,

        triggers jsonb NOT NULL
            DEFAULT '[]'::jsonb,

        symptoms jsonb NOT NULL
            DEFAULT '[]'::jsonb,

        evidence_requirement_ids text[] NOT NULL
            DEFAULT '{}'::text[],

        investigation_step_ids text[] NOT NULL
            DEFAULT '{}'::text[],

        hypothesis_ids text[] NOT NULL
            DEFAULT '{}'::text[],

        playbooks jsonb NOT NULL
            DEFAULT '[]'::jsonb,

        required_capabilities text[] NOT NULL
            DEFAULT '{}'::text[],

        risk jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        policy_requirements text[] NOT NULL
            DEFAULT '{}'::text[],

        rollback jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        verification jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        escalation jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        provenance jsonb NOT NULL,

        safety jsonb NOT NULL
            DEFAULT '{
                "evidenceOnly": true,
                "executionAuthorized": false,
                "grantsExecutionPermission": false,
                "bypassesPolicy": false,
                "bypassesAuthorization": false,
                "bypassesApproval": false,
                "bypassesEntitlements": false,
                "bypassesKillSwitch": false
            }'::jsonb,

        checksum text NULL,

        source_document jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        metadata jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        published_at timestamptz NULL,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT failure_mode_version_semver
            CHECK (
                semver ~
                '^\d+\.\d+\.\d+(?:-[A-Za-z0-9_.-]+)?(?:\+[A-Za-z0-9_.-]+)?$'
            ),

        CONSTRAINT failure_mode_version_severity
            CHECK (
                severity IN (
                    'INFO',
                    'LOW',
                    'MEDIUM',
                    'HIGH',
                    'CRITICAL'
                )
            ),

        CONSTRAINT failure_mode_version_lifecycle
            CHECK (
                lifecycle IN (
                    'DRAFT',
                    'VALIDATED',
                    'ACTIVE',
                    'DEPRECATED',
                    'RETIRED'
                )
            ),

        CONSTRAINT failure_mode_version_scope_type
            CHECK (
                scope_type IN (
                    'GLOBAL',
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT failure_mode_version_scope_integrity
            CHECK (
                (
                    scope_type = 'GLOBAL'
                    AND organization_id IS NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ORGANIZATION'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ENVIRONMENT'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NOT NULL
                )
            ),

        CONSTRAINT failure_mode_version_resources_present
            CHECK (
                cardinality(resource_types) > 0
            ),

        CONSTRAINT failure_mode_version_safety
            CHECK (
                safety @> '{
                    "evidenceOnly": true,
                    "executionAuthorized": false,
                    "grantsExecutionPermission": false,
                    "bypassesPolicy": false,
                    "bypassesAuthorization": false,
                    "bypassesApproval": false,
                    "bypassesEntitlements": false,
                    "bypassesKillSwitch": false
                }'::jsonb
            ),

        CONSTRAINT uq_failure_mode_version
            UNIQUE (
                failure_mode_definition_id,
                semver
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_failure_mode_versions_lookup
ON knowledge.failure_mode_versions (
    failure_mode_definition_id,
    lifecycle,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_failure_mode_versions_resource_types
ON knowledge.failure_mode_versions
USING GIN (
    resource_types
);


CREATE INDEX IF NOT EXISTS
    idx_failure_mode_versions_capabilities
ON knowledge.failure_mode_versions
USING GIN (
    required_capabilities
);


CREATE INDEX IF NOT EXISTS
    idx_failure_mode_versions_source_document
ON knowledge.failure_mode_versions
USING GIN (
    source_document
);


-- ============================================================================
-- PLAYBOOK DEFINITIONS
--
-- Stable identity replaces Mongo/in-memory canonical identity.
--
-- Existing PB-* logical IDs are retained.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    knowledge.playbook_definitions (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        playbook_key text NOT NULL,

        legacy_mongo_id text NULL UNIQUE,

        scope_type text NOT NULL,

        organization_id uuid NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        name text NOT NULL,

        description text NULL,

        owner_type text NOT NULL,

        source_type text NOT NULL
            DEFAULT 'SYSTEM',

        status text NOT NULL
            DEFAULT 'ACTIVE',

        metadata jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        updated_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT playbook_definition_key
            CHECK (
                playbook_key ~
                '^PB-[A-Z0-9]+(?:-[A-Z0-9]+)+$'
            ),

        CONSTRAINT playbook_definition_scope_type
            CHECK (
                scope_type IN (
                    'GLOBAL',
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT playbook_definition_scope_integrity
            CHECK (
                (
                    scope_type = 'GLOBAL'
                    AND organization_id IS NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ORGANIZATION'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ENVIRONMENT'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NOT NULL
                )
            ),

        CONSTRAINT playbook_definition_owner_type
            CHECK (
                owner_type IN (
                    'system',
                    'tenant'
                )
            ),

        CONSTRAINT playbook_definition_source_type
            CHECK (
                source_type IN (
                    'SYSTEM',
                    'YAML',
                    'API',
                    'MONGO_MIGRATION'
                )
            ),

        CONSTRAINT playbook_definition_status
            CHECK (
                status IN (
                    'ACTIVE',
                    'DEPRECATED',
                    'RETIRED'
                )
            )
    );


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_playbook_global_key
ON knowledge.playbook_definitions (
    playbook_key
)
WHERE
    scope_type = 'GLOBAL';


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_playbook_org_key
ON knowledge.playbook_definitions (
    organization_id,
    playbook_key
)
WHERE
    scope_type = 'ORGANIZATION';


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_playbook_environment_key
ON knowledge.playbook_definitions (
    organization_id,
    environment_id,
    playbook_key
)
WHERE
    scope_type = 'ENVIRONMENT';


CREATE INDEX IF NOT EXISTS
    idx_playbook_definition_scope
ON knowledge.playbook_definitions (
    organization_id,
    environment_id,
    status
);


-- ============================================================================
-- PLAYBOOK VERSIONS
--
-- Full canonical version document is stored because the existing Playbook
-- contract is intentionally rich and versioned.
--
-- Structured execution/runtime extraction remains service responsibility.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    knowledge.playbook_versions (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        playbook_definition_id uuid NOT NULL
            REFERENCES knowledge.playbook_definitions(id)
            ON DELETE RESTRICT,

        scope_type text NOT NULL,

        organization_id uuid NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        semver text NOT NULL,

        lifecycle text NOT NULL
            DEFAULT 'DRAFT',

        checksum text NULL,

        definition jsonb NOT NULL,

        provenance jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        safety jsonb NOT NULL
            DEFAULT '{
                "executionAuthorized": false,
                "grantsExecutionPermission": false,
                "bypassesPolicy": false,
                "bypassesAuthorization": false,
                "bypassesApproval": false,
                "bypassesEntitlements": false,
                "bypassesKillSwitch": false
            }'::jsonb,

        immutable boolean NOT NULL
            DEFAULT false,

        locked_at timestamptz NULL,

        first_executed_at timestamptz NULL,

        published_at timestamptz NULL,

        metadata jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT playbook_version_semver
            CHECK (
                semver ~
                '^\d+\.\d+\.\d+(?:-[A-Za-z0-9_.-]+)?(?:\+[A-Za-z0-9_.-]+)?$'
            ),

        CONSTRAINT playbook_version_lifecycle
            CHECK (
                lifecycle IN (
                    'DRAFT',
                    'VALIDATED',
                    'APPROVED',
                    'ACTIVE',
                    'DEPRECATED',
                    'DISABLED'
                )
            ),

        CONSTRAINT playbook_version_scope_type
            CHECK (
                scope_type IN (
                    'GLOBAL',
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT playbook_version_scope_integrity
            CHECK (
                (
                    scope_type = 'GLOBAL'
                    AND organization_id IS NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ORGANIZATION'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ENVIRONMENT'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NOT NULL
                )
            ),

        CONSTRAINT playbook_version_safety
            CHECK (
                safety @> '{
                    "executionAuthorized": false,
                    "grantsExecutionPermission": false,
                    "bypassesPolicy": false,
                    "bypassesAuthorization": false,
                    "bypassesApproval": false,
                    "bypassesEntitlements": false,
                    "bypassesKillSwitch": false
                }'::jsonb
            ),

        CONSTRAINT uq_playbook_version
            UNIQUE (
                playbook_definition_id,
                semver
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_playbook_versions_lookup
ON knowledge.playbook_versions (
    playbook_definition_id,
    lifecycle,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_playbook_versions_definition
ON knowledge.playbook_versions
USING GIN (
    definition
);


-- ============================================================================
-- RUNBOOK DEFINITIONS
--
-- Stable identity replaces models/Runbook.js Mongo persistence.
-- Existing RB-* logical identifiers are retained.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    knowledge.runbook_definitions (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        runbook_key text NOT NULL,

        legacy_mongo_id text NULL UNIQUE,

        scope_type text NOT NULL,

        organization_id uuid NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        name text NOT NULL,

        description text NULL,

        owner_type text NOT NULL,

        source_type text NOT NULL
            DEFAULT 'SYSTEM',

        status text NOT NULL
            DEFAULT 'ACTIVE',

        metadata jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        updated_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT runbook_definition_key
            CHECK (
                runbook_key ~
                '^RB-[A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)*$'
            ),

        CONSTRAINT runbook_definition_scope_type
            CHECK (
                scope_type IN (
                    'GLOBAL',
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT runbook_definition_scope_integrity
            CHECK (
                (
                    scope_type = 'GLOBAL'
                    AND organization_id IS NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ORGANIZATION'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ENVIRONMENT'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NOT NULL
                )
            ),

        CONSTRAINT runbook_definition_owner_type
            CHECK (
                owner_type IN (
                    'system',
                    'tenant'
                )
            ),

        CONSTRAINT runbook_definition_source_type
            CHECK (
                source_type IN (
                    'SYSTEM',
                    'YAML',
                    'API',
                    'MONGO_MIGRATION'
                )
            ),

        CONSTRAINT runbook_definition_status
            CHECK (
                status IN (
                    'ACTIVE',
                    'DEPRECATED',
                    'RETIRED'
                )
            )
    );


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_runbook_global_key
ON knowledge.runbook_definitions (
    runbook_key
)
WHERE
    scope_type = 'GLOBAL';


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_runbook_org_key
ON knowledge.runbook_definitions (
    organization_id,
    runbook_key
)
WHERE
    scope_type = 'ORGANIZATION';


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_runbook_environment_key
ON knowledge.runbook_definitions (
    organization_id,
    environment_id,
    runbook_key
)
WHERE
    scope_type = 'ENVIRONMENT';


CREATE INDEX IF NOT EXISTS
    idx_runbook_definition_scope
ON knowledge.runbook_definitions (
    organization_id,
    environment_id,
    status
);


-- ============================================================================
-- RUNBOOK VERSIONS
--
-- Full deterministic operational procedure document.
--
-- Existing action handlers remain separate runtime code. This table stores
-- the approved versioned procedure definition, not executable arbitrary code.
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    knowledge.runbook_versions (
        id uuid PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id text NOT NULL UNIQUE,

        runbook_definition_id uuid NOT NULL
            REFERENCES knowledge.runbook_definitions(id)
            ON DELETE RESTRICT,

        scope_type text NOT NULL,

        organization_id uuid NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id uuid NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        semver text NOT NULL,

        lifecycle text NOT NULL
            DEFAULT 'DRAFT',

        checksum text NULL,

        definition jsonb NOT NULL,

        provenance jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        safety jsonb NOT NULL
            DEFAULT '{
                "executionAuthorized": false,
                "grantsExecutionPermission": false,
                "bypassesPolicy": false,
                "bypassesAuthorization": false,
                "bypassesApproval": false,
                "bypassesEntitlements": false,
                "bypassesKillSwitch": false
            }'::jsonb,

        immutable boolean NOT NULL
            DEFAULT false,

        locked_at timestamptz NULL,

        first_executed_at timestamptz NULL,

        published_at timestamptz NULL,

        metadata jsonb NOT NULL
            DEFAULT '{}'::jsonb,

        created_at timestamptz NOT NULL
            DEFAULT now(),

        CONSTRAINT runbook_version_semver
            CHECK (
                semver ~
                '^\d+\.\d+\.\d+(?:-[A-Za-z0-9_.-]+)?(?:\+[A-Za-z0-9_.-]+)?$'
            ),

        CONSTRAINT runbook_version_lifecycle
            CHECK (
                lifecycle IN (
                    'DRAFT',
                    'VALIDATED',
                    'APPROVED',
                    'ACTIVE',
                    'DEPRECATED',
                    'DISABLED'
                )
            ),

        CONSTRAINT runbook_version_scope_type
            CHECK (
                scope_type IN (
                    'GLOBAL',
                    'ORGANIZATION',
                    'ENVIRONMENT'
                )
            ),

        CONSTRAINT runbook_version_scope_integrity
            CHECK (
                (
                    scope_type = 'GLOBAL'
                    AND organization_id IS NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ORGANIZATION'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NULL
                )
                OR
                (
                    scope_type = 'ENVIRONMENT'
                    AND organization_id IS NOT NULL
                    AND environment_id IS NOT NULL
                )
            ),

        CONSTRAINT runbook_version_safety
            CHECK (
                safety @> '{
                    "executionAuthorized": false,
                    "grantsExecutionPermission": false,
                    "bypassesPolicy": false,
                    "bypassesAuthorization": false,
                    "bypassesApproval": false,
                    "bypassesEntitlements": false,
                    "bypassesKillSwitch": false
                }'::jsonb
            ),

        CONSTRAINT uq_runbook_version
            UNIQUE (
                runbook_definition_id,
                semver
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_runbook_versions_lookup
ON knowledge.runbook_versions (
    runbook_definition_id,
    lifecycle,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_versions_definition
ON knowledge.runbook_versions
USING GIN (
    definition
);


-- ============================================================================
-- KNOWLEDGE-SCOPE FUNCTIONS
--
-- GLOBAL knowledge is readable but intentionally not writable by ordinary
-- tenant-scoped application sessions.
--
-- Built-in GLOBAL knowledge is installed through controlled migration/import
-- paths.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    knowledge.scope_visible(
        p_scope_type text,
        p_organization_id uuid,
        p_environment_id uuid
    )
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        p_scope_type = 'GLOBAL'

        OR

        (
            p_scope_type = 'ORGANIZATION'
            AND
            p_organization_id =
                tenancy.current_organization_id()
        )

        OR

        (
            p_scope_type = 'ENVIRONMENT'
            AND
            p_organization_id =
                tenancy.current_organization_id()
            AND
            p_environment_id =
                tenancy.current_environment_id()
        );
$$;


CREATE OR REPLACE FUNCTION
    knowledge.scope_writable(
        p_scope_type text,
        p_organization_id uuid,
        p_environment_id uuid
    )
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT
        (
            p_scope_type = 'ORGANIZATION'
            AND
            p_organization_id =
                tenancy.current_organization_id()
            AND
            p_environment_id IS NULL
        )

        OR

        (
            p_scope_type = 'ENVIRONMENT'
            AND
            p_organization_id =
                tenancy.current_organization_id()
            AND
            p_environment_id =
                tenancy.current_environment_id()
        );
$$;


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE
    knowledge.failure_mode_definitions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    knowledge.failure_mode_definitions
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    knowledge.failure_mode_versions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    knowledge.failure_mode_versions
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    knowledge.playbook_definitions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    knowledge.playbook_definitions
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    knowledge.playbook_versions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    knowledge.playbook_versions
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    knowledge.runbook_definitions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    knowledge.runbook_definitions
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    knowledge.runbook_versions
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    knowledge.runbook_versions
FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- FAILURE MODE RLS
-- ============================================================================

DROP POLICY IF EXISTS
    failure_mode_definitions_select
ON knowledge.failure_mode_definitions;

CREATE POLICY
    failure_mode_definitions_select
ON knowledge.failure_mode_definitions
FOR SELECT
USING (
    knowledge.scope_visible(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    failure_mode_definitions_insert
ON knowledge.failure_mode_definitions;

CREATE POLICY
    failure_mode_definitions_insert
ON knowledge.failure_mode_definitions
FOR INSERT
WITH CHECK (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    failure_mode_definitions_update
ON knowledge.failure_mode_definitions;

CREATE POLICY
    failure_mode_definitions_update
ON knowledge.failure_mode_definitions
FOR UPDATE
USING (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
)
WITH CHECK (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    failure_mode_definitions_delete
ON knowledge.failure_mode_definitions;

CREATE POLICY
    failure_mode_definitions_delete
ON knowledge.failure_mode_definitions
FOR DELETE
USING (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    failure_mode_versions_select
ON knowledge.failure_mode_versions;

CREATE POLICY
    failure_mode_versions_select
ON knowledge.failure_mode_versions
FOR SELECT
USING (
    knowledge.scope_visible(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    failure_mode_versions_write
ON knowledge.failure_mode_versions;

CREATE POLICY
    failure_mode_versions_write
ON knowledge.failure_mode_versions
FOR ALL
USING (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
)
WITH CHECK (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


-- ============================================================================
-- PLAYBOOK RLS
-- ============================================================================

DROP POLICY IF EXISTS
    playbook_definitions_select
ON knowledge.playbook_definitions;

CREATE POLICY
    playbook_definitions_select
ON knowledge.playbook_definitions
FOR SELECT
USING (
    knowledge.scope_visible(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    playbook_definitions_write
ON knowledge.playbook_definitions;

CREATE POLICY
    playbook_definitions_write
ON knowledge.playbook_definitions
FOR ALL
USING (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
)
WITH CHECK (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    playbook_versions_select
ON knowledge.playbook_versions;

CREATE POLICY
    playbook_versions_select
ON knowledge.playbook_versions
FOR SELECT
USING (
    knowledge.scope_visible(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    playbook_versions_write
ON knowledge.playbook_versions;

CREATE POLICY
    playbook_versions_write
ON knowledge.playbook_versions
FOR ALL
USING (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
)
WITH CHECK (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


-- ============================================================================
-- RUNBOOK RLS
-- ============================================================================

DROP POLICY IF EXISTS
    runbook_definitions_select
ON knowledge.runbook_definitions;

CREATE POLICY
    runbook_definitions_select
ON knowledge.runbook_definitions
FOR SELECT
USING (
    knowledge.scope_visible(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    runbook_definitions_write
ON knowledge.runbook_definitions;

CREATE POLICY
    runbook_definitions_write
ON knowledge.runbook_definitions
FOR ALL
USING (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
)
WITH CHECK (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    runbook_versions_select
ON knowledge.runbook_versions;

CREATE POLICY
    runbook_versions_select
ON knowledge.runbook_versions
FOR SELECT
USING (
    knowledge.scope_visible(
        scope_type,
        organization_id,
        environment_id
    )
);


DROP POLICY IF EXISTS
    runbook_versions_write
ON knowledge.runbook_versions;

CREATE POLICY
    runbook_versions_write
ON knowledge.runbook_versions
FOR ALL
USING (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
)
WITH CHECK (
    knowledge.scope_writable(
        scope_type,
        organization_id,
        environment_id
    )
);


-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON SCHEMA knowledge IS
    'Phase 18 canonical PostgreSQL operational knowledge store.';


COMMENT ON TABLE
    knowledge.failure_mode_definitions
IS
    'Stable FailureMode identities. Operational content is versioned separately.';


COMMENT ON TABLE
    knowledge.failure_mode_versions
IS
    'Versioned FailureMode operational knowledge. Never grants execution authorization.';


COMMENT ON TABLE
    knowledge.playbook_definitions
IS
    'Stable Playbook identity replacing Mongo/in-memory canonical identity.';


COMMENT ON TABLE
    knowledge.playbook_versions
IS
    'Versioned deterministic Playbook orchestration definitions.';


COMMENT ON TABLE
    knowledge.runbook_definitions
IS
    'Stable Runbook identity replacing Mongoose Runbook persistence.';


COMMENT ON TABLE
    knowledge.runbook_versions
IS
    'Versioned approved deterministic operational procedures. Registered action handlers remain runtime-controlled.';


COMMIT;