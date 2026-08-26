-- ============================================================================
-- AIRA PHASE 14.4A
-- SERVICE ACCOUNTS + API KEYS
-- ============================================================================
--
-- Human:
--
--   User
--     |
--     +-- OrganizationMembership
--     +-- Browser Session
--
-- Machine:
--
--   ServiceAccount
--     |
--     +-- API Key
--
-- SECURITY:
--
-- - service accounts are organization scoped
-- - service accounts are not users
-- - API key plaintext is never persisted
-- - API keys may expire
-- - API keys may be revoked
-- - permissions are explicitly scoped
-- - optional environment restriction
-- ============================================================================


-- ============================================================================
-- SERVICE ACCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.service_accounts (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    description TEXT,

    status TEXT NOT NULL
        DEFAULT 'active',

    permissions JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    environment_ids JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    expires_at TIMESTAMPTZ,

    last_authenticated_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    revoked_at TIMESTAMPTZ,

    revoked_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    revocation_reason TEXT,

    CONSTRAINT service_accounts_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT service_accounts_org_name_unique
        UNIQUE (
            organization_id,
            name
        ),

    CONSTRAINT service_accounts_status_check
        CHECK (
            status IN (
                'active',
                'suspended',
                'revoked'
            )
        ),

    CONSTRAINT service_accounts_name_nonempty
        CHECK (
            length(trim(name)) > 0
        ),

    CONSTRAINT service_accounts_permissions_array
        CHECK (
            jsonb_typeof(
                permissions
            ) = 'array'
        ),

    CONSTRAINT service_accounts_environment_ids_array
        CHECK (
            jsonb_typeof(
                environment_ids
            ) = 'array'
        )
);


CREATE INDEX IF NOT EXISTS
    idx_service_accounts_organization
ON identity.service_accounts (
    organization_id,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_service_accounts_expiry
ON identity.service_accounts (
    expires_at
)
WHERE
    status = 'active'
    AND expires_at IS NOT NULL;


-- ============================================================================
-- API KEYS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.api_keys (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    service_account_id UUID NOT NULL
        REFERENCES identity.service_accounts(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    -- Safe identifier displayed to users.
    -- Example:
    --
    --   aira_live_a83f1d91
    --
    key_prefix TEXT NOT NULL,

    -- SHA-256 of the full high-entropy API key.
    -- The plaintext API key is returned exactly once and never stored.
    key_hash TEXT NOT NULL,

    expires_at TIMESTAMPTZ,

    last_used_at TIMESTAMPTZ,

    last_used_ip_hash TEXT,

    usage_count BIGINT NOT NULL
        DEFAULT 0,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    revoked_at TIMESTAMPTZ,

    revoked_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    revocation_reason TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    CONSTRAINT api_keys_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT api_keys_key_hash_unique
        UNIQUE (key_hash),

    CONSTRAINT api_keys_key_prefix_unique
        UNIQUE (key_prefix),

    CONSTRAINT api_keys_name_nonempty
        CHECK (
            length(trim(name)) > 0
        )
);


CREATE INDEX IF NOT EXISTS
    idx_api_keys_service_account
ON identity.api_keys (
    organization_id,
    service_account_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_api_keys_active
ON identity.api_keys (
    key_prefix
)
WHERE
    revoked_at IS NULL;


CREATE INDEX IF NOT EXISTS
    idx_api_keys_expiry
ON identity.api_keys (
    expires_at
)
WHERE
    revoked_at IS NULL
    AND expires_at IS NOT NULL;


-- ============================================================================
-- ORGANIZATION-SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
    identity.aira_validate_api_key_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    account_org UUID;
BEGIN
    SELECT
        organization_id
    INTO
        account_org
    FROM
        identity.service_accounts
    WHERE
        id = NEW.service_account_id;

    IF account_org IS NULL THEN
        RAISE EXCEPTION
            'service account does not exist';
    END IF;

    IF account_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'API key organization does not match service account organization';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_api_key_scope
ON identity.api_keys;


CREATE TRIGGER
    trg_api_key_scope
BEFORE INSERT OR UPDATE
ON identity.api_keys
FOR EACH ROW
EXECUTE FUNCTION
    identity.aira_validate_api_key_scope();


-- ============================================================================
-- UPDATED-AT
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_service_accounts_updated_at
ON identity.service_accounts;


CREATE TRIGGER
    trg_service_accounts_updated_at
BEFORE UPDATE
ON identity.service_accounts
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();