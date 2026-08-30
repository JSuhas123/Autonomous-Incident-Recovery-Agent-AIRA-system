-- ============================================================================
-- AIRA PHASE 20.3
-- INTEGRATION PLATFORM — CANONICAL POSTGRESQL FOUNDATION
-- ============================================================================
--
-- Canonical authority:
--
--   integrations.connections
--   integrations.credential_references
--
-- Existing:
--
--   integrations.connection_governance
--
-- remains the canonical governance layer.
--
-- Architectural laws:
--
--   - PostgreSQL is canonical integration control-plane truth.
--   - Every connection belongs to one organization + environment.
--   - Credentials are represented by references, not exposed through
--     ordinary connection queries.
--   - Capability does not imply authorization.
--   - Integration persistence never authorizes execution.
--   - Customer MongoDB remains a supported external provider, but MongoDB
--     is not AIRA's canonical integration store.
-- ============================================================================


CREATE SCHEMA IF NOT EXISTS integrations;


-- ============================================================================
-- CONNECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS integrations.connections (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL
        UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    provider TEXT NOT NULL,

    name TEXT NOT NULL,

    external_account_id TEXT,

    service_ids JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    capabilities JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    non_secret_config JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    status TEXT NOT NULL
        DEFAULT 'draft',

    health_status TEXT NOT NULL
        DEFAULT 'unknown',

    connected_at TIMESTAMPTZ,

    disconnected_at TIMESTAMPTZ,

    disabled_at TIMESTAMPTZ,

    disabled_reason TEXT,

    last_health_check_at TIMESTAMPTZ,

    last_event_at TIMESTAMPTZ,

    last_successful_event_at TIMESTAMPTZ,

    last_error_at TIMESTAMPTZ,

    error_summary TEXT,

    consecutive_failures INTEGER NOT NULL
        DEFAULT 0,

    last_latency_ms INTEGER,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    updated_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL
        DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT integrations_connections_provider_not_blank
        CHECK (
            NULLIF(
                BTRIM(provider),
                ''
            ) IS NOT NULL
        ),

    CONSTRAINT integrations_connections_name_not_blank
        CHECK (
            NULLIF(
                BTRIM(name),
                ''
            ) IS NOT NULL
        ),

    CONSTRAINT integrations_connections_provider_length
        CHECK (
            CHAR_LENGTH(provider) <= 64
        ),

    CONSTRAINT integrations_connections_name_length
        CHECK (
            CHAR_LENGTH(name) <= 128
        ),

    CONSTRAINT integrations_connections_external_account_length
        CHECK (
            external_account_id IS NULL
            OR
            CHAR_LENGTH(external_account_id) <= 256
        ),

    CONSTRAINT integrations_connections_disabled_reason_length
        CHECK (
            disabled_reason IS NULL
            OR
            CHAR_LENGTH(disabled_reason) <= 512
        ),

    CONSTRAINT integrations_connections_error_summary_length
        CHECK (
            error_summary IS NULL
            OR
            CHAR_LENGTH(error_summary) <= 512
        ),

    CONSTRAINT integrations_connections_status_check
        CHECK (
            status IN (
                'draft',
                'connected',
                'degraded',
                'disconnected',
                'disabled'
            )
        ),

    CONSTRAINT integrations_connections_health_status_check
        CHECK (
            health_status IN (
                'unknown',
                'healthy',
                'degraded',
                'unhealthy'
            )
        ),

    CONSTRAINT integrations_connections_service_ids_array
        CHECK (
            jsonb_typeof(
                service_ids
            ) = 'array'
        ),

    CONSTRAINT integrations_connections_capabilities_array
        CHECK (
            jsonb_typeof(
                capabilities
            ) = 'array'
        ),

    CONSTRAINT integrations_connections_config_object
        CHECK (
            jsonb_typeof(
                non_secret_config
            ) = 'object'
        ),

    CONSTRAINT integrations_connections_metadata_object
        CHECK (
            jsonb_typeof(
                metadata
            ) = 'object'
        ),

    CONSTRAINT integrations_connections_failure_count_check
        CHECK (
            consecutive_failures >= 0
        ),

    CONSTRAINT integrations_connections_latency_check
        CHECK (
            last_latency_ms IS NULL
            OR
            last_latency_ms >= 0
        ),

    CONSTRAINT integrations_connections_never_authorize
        CHECK (
            execution_authorized = FALSE
        )
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_connections_scope
ON integrations.connections (
    organization_id,
    environment_id
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_connections_provider
ON integrations.connections (
    organization_id,
    environment_id,
    provider
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_connections_status
ON integrations.connections (
    organization_id,
    environment_id,
    status
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_connections_health
ON integrations.connections (
    organization_id,
    environment_id,
    health_status
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_connections_created
ON integrations.connections (
    organization_id,
    environment_id,
    created_at DESC
);


-- ============================================================================
-- CREDENTIAL REFERENCES
-- ============================================================================
--
-- This table deliberately separates credential material/reference metadata
-- from ordinary connection records.
--
-- provider_type:
--
--   local_encrypted
--   external_secret_manager
--
-- reference_value may contain AIRA-encrypted material for the current local
-- secret implementation OR an opaque external secret-manager reference.
--
-- Ordinary connection repository methods never return reference_value.
-- ============================================================================

CREATE TABLE IF NOT EXISTS integrations.credential_references (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL
        UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    connection_id UUID NOT NULL
        REFERENCES integrations.connections(id)
        ON DELETE CASCADE,

    provider_type TEXT NOT NULL
        DEFAULT 'local_encrypted',

    reference_value TEXT NOT NULL,

    secret_version TEXT,

    status TEXT NOT NULL
        DEFAULT 'active',

    rotated_at TIMESTAMPTZ,

    revoked_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL
        DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT integrations_credential_connection_unique
        UNIQUE (
            organization_id,
            environment_id,
            connection_id
        ),

    CONSTRAINT integrations_credential_provider_type_check
        CHECK (
            provider_type IN (
                'local_encrypted',
                'external_secret_manager'
            )
        ),

    CONSTRAINT integrations_credential_status_check
        CHECK (
            status IN (
                'active',
                'rotated',
                'revoked'
            )
        ),

    CONSTRAINT integrations_credential_reference_not_blank
        CHECK (
            NULLIF(
                BTRIM(reference_value),
                ''
            ) IS NOT NULL
        ),

    CONSTRAINT integrations_credential_metadata_object
        CHECK (
            jsonb_typeof(
                metadata
            ) = 'object'
        ),

    CONSTRAINT integrations_credential_never_authorize
        CHECK (
            execution_authorized = FALSE
        )
);


CREATE INDEX IF NOT EXISTS
    idx_integrations_credentials_connection
ON integrations.credential_references (
    organization_id,
    environment_id,
    connection_id
);


-- ============================================================================
-- SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    integrations.aira_validate_connection_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actual_organization_id UUID;
BEGIN
    SELECT
        organization_id
    INTO
        actual_organization_id
    FROM
        tenancy.environments
    WHERE
        id = NEW.environment_id;

    IF actual_organization_id IS NULL THEN
        RAISE EXCEPTION
            'environment does not exist';
    END IF;

    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'integration connection organization mismatch';
    END IF;

    NEW.provider =
        LOWER(
            BTRIM(
                NEW.provider
            )
        );

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_integrations_connections_scope
ON integrations.connections;


CREATE TRIGGER
    trg_integrations_connections_scope
BEFORE INSERT OR UPDATE
ON integrations.connections
FOR EACH ROW
EXECUTE FUNCTION
    integrations.aira_validate_connection_scope();


CREATE OR REPLACE FUNCTION
    integrations.aira_validate_credential_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    connection_organization_id UUID;
    connection_environment_id UUID;
BEGIN
    SELECT
        organization_id,
        environment_id
    INTO
        connection_organization_id,
        connection_environment_id
    FROM
        integrations.connections
    WHERE
        id = NEW.connection_id;

    IF connection_organization_id IS NULL THEN
        RAISE EXCEPTION
            'integration connection does not exist';
    END IF;

    IF
        connection_organization_id <> NEW.organization_id
        OR
        connection_environment_id <> NEW.environment_id
    THEN
        RAISE EXCEPTION
            'integration credential scope mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_integrations_credentials_scope
ON integrations.credential_references;


CREATE TRIGGER
    trg_integrations_credentials_scope
BEFORE INSERT OR UPDATE
ON integrations.credential_references
FOR EACH ROW
EXECUTE FUNCTION
    integrations.aira_validate_credential_scope();


-- ============================================================================
-- UPDATED AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_integrations_connections_updated_at
ON integrations.connections;


CREATE TRIGGER
    trg_integrations_connections_updated_at
BEFORE UPDATE
ON integrations.connections
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_integrations_credentials_updated_at
ON integrations.credential_references;


CREATE TRIGGER
    trg_integrations_credentials_updated_at
BEFORE UPDATE
ON integrations.credential_references
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE
    integrations.connections
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    integrations.connections
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    integrations.credential_references
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    integrations.credential_references
FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- CONNECTION POLICIES
-- ============================================================================

DROP POLICY IF EXISTS
    integrations_connections_select
ON integrations.connections;


CREATE POLICY
    integrations_connections_select
ON integrations.connections
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    integrations_connections_insert
ON integrations.connections;


CREATE POLICY
    integrations_connections_insert
ON integrations.connections
FOR INSERT
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = FALSE
);


DROP POLICY IF EXISTS
    integrations_connections_update
ON integrations.connections;


CREATE POLICY
    integrations_connections_update
ON integrations.connections
FOR UPDATE
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = FALSE
);


DROP POLICY IF EXISTS
    integrations_connections_delete
ON integrations.connections;


CREATE POLICY
    integrations_connections_delete
ON integrations.connections
FOR DELETE
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


-- ============================================================================
-- CREDENTIAL POLICIES
-- ============================================================================

DROP POLICY IF EXISTS
    integrations_credentials_select
ON integrations.credential_references;


CREATE POLICY
    integrations_credentials_select
ON integrations.credential_references
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    integrations_credentials_insert
ON integrations.credential_references;


CREATE POLICY
    integrations_credentials_insert
ON integrations.credential_references
FOR INSERT
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = FALSE
);


DROP POLICY IF EXISTS
    integrations_credentials_update
ON integrations.credential_references;


CREATE POLICY
    integrations_credentials_update
ON integrations.credential_references
FOR UPDATE
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized = FALSE
);


DROP POLICY IF EXISTS
    integrations_credentials_delete
ON integrations.credential_references;


CREATE POLICY
    integrations_credentials_delete
ON integrations.credential_references
FOR DELETE
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);