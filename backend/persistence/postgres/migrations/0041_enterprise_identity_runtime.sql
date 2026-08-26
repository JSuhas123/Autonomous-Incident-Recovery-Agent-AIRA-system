-- ============================================================================
-- AIRA PHASE 14.7B-G
-- ENTERPRISE IDENTITY RUNTIME
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.enterprise_login_states (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    provider_id UUID NOT NULL
        REFERENCES identity.identity_providers(id)
        ON DELETE CASCADE,

    state_hash TEXT NOT NULL,

    nonce_hash TEXT NOT NULL,

    redirect_uri TEXT,

    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT enterprise_login_state_hash_unique
        UNIQUE (state_hash)
);


CREATE INDEX IF NOT EXISTS
    idx_enterprise_login_states_active
ON identity.enterprise_login_states (
    provider_id,
    expires_at
)
WHERE consumed_at IS NULL;


CREATE INDEX IF NOT EXISTS
    idx_external_identity_subject_lookup
ON identity.external_identities (
    provider_id,
    provider_subject
);


CREATE INDEX IF NOT EXISTS
    idx_verified_login_domains
ON identity.organization_domains (
    lower(domain)
)
WHERE status = 'verified';