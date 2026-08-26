-- ============================================================================
-- AIRA PHASE 14.9
-- TENANT-OWNED INTEGRATION GOVERNANCE
-- ============================================================================
--
-- The operational IntegrationConnection already exists.
--
-- This table stores enterprise control-plane policy around that connection.
-- It deliberately does NOT duplicate provider configuration or credentials.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS integrations;


CREATE TABLE IF NOT EXISTS integrations.connection_governance (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    integration_id TEXT NOT NULL,

    provider TEXT,

    enabled BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_ingestion BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_queries BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_resource_discovery BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_execution BOOLEAN NOT NULL
        DEFAULT FALSE,

    credential_access_mode TEXT NOT NULL
        DEFAULT 'managed_only',

    credential_rotation_required BOOLEAN NOT NULL
        DEFAULT TRUE,

    credential_rotation_days INTEGER NOT NULL
        DEFAULT 90,

    allowed_capabilities JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    denied_capabilities JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    rate_limits JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    updated_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT integration_governance_scope_unique
        UNIQUE (
            organization_id,
            environment_id,
            integration_id
        ),

    CONSTRAINT integration_governance_credential_access_check
        CHECK (
            credential_access_mode IN (
                'managed_only',
                'restricted',
                'disabled'
            )
        ),

    CONSTRAINT integration_governance_rotation_days_check
        CHECK (
            credential_rotation_days > 0
        ),

    CONSTRAINT integration_governance_allowed_capabilities_array
        CHECK (
            jsonb_typeof(
                allowed_capabilities
            ) = 'array'
        ),

    CONSTRAINT integration_governance_denied_capabilities_array
        CHECK (
            jsonb_typeof(
                denied_capabilities
            ) = 'array'
        )
);


CREATE INDEX IF NOT EXISTS
    idx_integration_governance_scope
ON integrations.connection_governance (
    organization_id,
    environment_id
);


CREATE OR REPLACE FUNCTION
    integrations.aira_validate_integration_governance_scope()
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
            'integration governance organization mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_integration_governance_scope
ON integrations.connection_governance;


CREATE TRIGGER
    trg_integration_governance_scope
BEFORE INSERT OR UPDATE
ON integrations.connection_governance
FOR EACH ROW
EXECUTE FUNCTION
    integrations.aira_validate_integration_governance_scope();


DROP TRIGGER IF EXISTS
    trg_integration_governance_updated_at
ON integrations.connection_governance;


CREATE TRIGGER
    trg_integration_governance_updated_at
BEFORE UPDATE
ON integrations.connection_governance
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();