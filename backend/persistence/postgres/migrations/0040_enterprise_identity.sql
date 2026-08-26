-- ============================================================================
-- AIRA PHASE 14.7A
-- ENTERPRISE IDENTITY / SSO FOUNDATION
-- ============================================================================
--
-- Organization
--    |
--    +-- identity providers
--    |
--    +-- verified domains
--    |
--    +-- authentication policy
--    |
--    +-- external identities
--
-- Supports:
--
--   OIDC
--   SAML
--
-- Future:
--
--   SCIM
--   workload federation
--   automatic provisioning
--
-- SECURITY:
--
-- - IdP config is tenant-scoped
-- - external identities cannot cross organizations
-- - domains are globally unique once verified
-- - SSO enforcement remains organization-owned
-- - local auth is not destroyed merely by enabling SSO
-- ============================================================================


-- ============================================================================
-- IDENTITY PROVIDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.identity_providers (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    provider_type TEXT NOT NULL,

    name TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'draft',

    -- ------------------------------------------------------------------------
    -- OIDC
    -- ------------------------------------------------------------------------

    issuer_url TEXT,

    client_id TEXT,

    client_secret_encrypted TEXT,

    authorization_endpoint TEXT,

    token_endpoint TEXT,

    userinfo_endpoint TEXT,

    jwks_uri TEXT,

    scopes JSONB NOT NULL
        DEFAULT '["openid","profile","email"]'::jsonb,

    -- ------------------------------------------------------------------------
    -- SAML
    -- ------------------------------------------------------------------------

    saml_entity_id TEXT,

    saml_sso_url TEXT,

    saml_certificate TEXT,

    saml_metadata_url TEXT,

    -- ------------------------------------------------------------------------
    -- ATTRIBUTE MAPPING
    -- ------------------------------------------------------------------------

    email_claim TEXT NOT NULL
        DEFAULT 'email',

    name_claim TEXT,

    subject_claim TEXT NOT NULL
        DEFAULT 'sub',

    attribute_mapping JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    -- ------------------------------------------------------------------------
    -- SECURITY
    -- ------------------------------------------------------------------------

    allow_account_linking BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_just_in_time_provisioning BOOLEAN NOT NULL
        DEFAULT FALSE,

    default_role TEXT,

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

    activated_at TIMESTAMPTZ,

    disabled_at TIMESTAMPTZ,

    CONSTRAINT identity_provider_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT identity_provider_org_name_unique
        UNIQUE (
            organization_id,
            name
        ),

    CONSTRAINT identity_provider_type_check
        CHECK (
            provider_type IN (
                'oidc',
                'saml'
            )
        ),

    CONSTRAINT identity_provider_status_check
        CHECK (
            status IN (
                'draft',
                'active',
                'disabled'
            )
        ),

    CONSTRAINT identity_provider_name_nonempty
        CHECK (
            length(
                trim(name)
            ) > 0
        ),

    CONSTRAINT identity_provider_scopes_array
        CHECK (
            jsonb_typeof(
                scopes
            ) = 'array'
        )
);


CREATE INDEX IF NOT EXISTS
    idx_identity_providers_org
ON identity.identity_providers (
    organization_id,
    status
);


-- ============================================================================
-- ORGANIZATION LOGIN DOMAINS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.organization_domains (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    domain TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'pending',

    verification_token_hash TEXT NOT NULL,

    verification_method TEXT NOT NULL
        DEFAULT 'dns_txt',

    verified_at TIMESTAMPTZ,

    verified_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT organization_domain_unique
        UNIQUE (domain),

    CONSTRAINT organization_domain_status_check
        CHECK (
            status IN (
                'pending',
                'verified',
                'revoked'
            )
        ),

    CONSTRAINT organization_domain_method_check
        CHECK (
            verification_method IN (
                'dns_txt'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_organization_domains_org
ON identity.organization_domains (
    organization_id,
    status
);


-- ============================================================================
-- ORGANIZATION AUTHENTICATION POLICY
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.organization_authentication_policies (
    organization_id UUID PRIMARY KEY
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    login_mode TEXT NOT NULL
        DEFAULT 'local_and_sso',

    sso_required BOOLEAN NOT NULL
        DEFAULT FALSE,

    require_verified_domain BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_local_owner_bypass BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_password_login BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_oauth_login BOOLEAN NOT NULL
        DEFAULT TRUE,

    allow_api_keys BOOLEAN NOT NULL
        DEFAULT TRUE,

    session_max_age_seconds INTEGER,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    updated_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT organization_auth_policy_login_mode_check
        CHECK (
            login_mode IN (
                'local_only',
                'local_and_sso',
                'sso_preferred',
                'sso_required'
            )
        )
);


-- ============================================================================
-- EXTERNAL IDENTITIES
--
-- Links a provider identity to an existing AIRA user.
--
-- External identity != organization membership.
--
-- Membership authorization remains independent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.external_identities (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    provider_id UUID NOT NULL
        REFERENCES identity.identity_providers(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES identity.users(id)
        ON DELETE CASCADE,

    provider_subject TEXT NOT NULL,

    provider_email TEXT,

    claims JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    last_authenticated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT external_identity_provider_subject_unique
        UNIQUE (
            provider_id,
            provider_subject
        ),

    CONSTRAINT external_identity_user_provider_unique
        UNIQUE (
            user_id,
            provider_id
        )
);


CREATE INDEX IF NOT EXISTS
    idx_external_identities_user
ON identity.external_identities (
    organization_id,
    user_id
);


-- ============================================================================
-- PROVIDER ORGANIZATION BOUNDARY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    identity.aira_validate_external_identity_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    provider_org UUID;
BEGIN
    SELECT
        organization_id
    INTO
        provider_org
    FROM
        identity.identity_providers
    WHERE
        id = NEW.provider_id;

    IF provider_org IS NULL THEN
        RAISE EXCEPTION
            'identity provider does not exist';
    END IF;

    IF provider_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'external identity organization does not match provider organization';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_external_identity_scope
ON identity.external_identities;


CREATE TRIGGER
    trg_external_identity_scope
BEFORE INSERT OR UPDATE
ON identity.external_identities
FOR EACH ROW
EXECUTE FUNCTION
    identity.aira_validate_external_identity_scope();


-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_identity_providers_updated_at
ON identity.identity_providers;


CREATE TRIGGER
    trg_identity_providers_updated_at
BEFORE UPDATE
ON identity.identity_providers
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_organization_domains_updated_at
ON identity.organization_domains;


CREATE TRIGGER
    trg_organization_domains_updated_at
BEFORE UPDATE
ON identity.organization_domains
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_organization_authentication_policies_updated_at
ON identity.organization_authentication_policies;


CREATE TRIGGER
    trg_organization_authentication_policies_updated_at
BEFORE UPDATE
ON identity.organization_authentication_policies
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_external_identities_updated_at
ON identity.external_identities;


CREATE TRIGGER
    trg_external_identities_updated_at
BEFORE UPDATE
ON identity.external_identities
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();