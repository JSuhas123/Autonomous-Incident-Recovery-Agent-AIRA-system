-- ============================================================================
-- AIRA PHASE 13.6A
-- MIGRATION 0014 — IDENTITY + PLATFORM AUTH FOUNDATION
-- ============================================================================
--
-- Purpose
--
-- Move AIRA's human identity/session/platform tenancy foundation toward
-- PostgreSQL so MongoDB can eventually be retired completely.
--
-- Existing migrations are immutable. This migration only evolves forward.
-- ============================================================================


-- ============================================================================
-- SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS identity;


-- ============================================================================
-- ORGANIZATION PARITY
-- ============================================================================

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS tenant_public_id TEXT;

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS settings JSONB
    NOT NULL
    DEFAULT '{}'::jsonb;

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS created_by_user_legacy_id TEXT;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_organizations_slug_unique
ON tenancy.organizations (
  slug
)
WHERE slug IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_organizations_tenant_public_id
ON tenancy.organizations (
  tenant_public_id
)
WHERE tenant_public_id IS NOT NULL;


-- ============================================================================
-- ENVIRONMENT PARITY
-- ============================================================================

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS criticality TEXT
    NOT NULL
    DEFAULT 'medium';

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS description TEXT
    NOT NULL
    DEFAULT '';

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS settings JSONB
    NOT NULL
    DEFAULT '{}'::jsonb;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS created_by_user_legacy_id TEXT;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS maintenance_reason TEXT;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS maintenance_started_at TIMESTAMPTZ;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS archived_by_user_legacy_id TEXT;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_environments_org_slug_unique
ON tenancy.environments (
  organization_id,
  slug
)
WHERE slug IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_environments_org_type
ON tenancy.environments (
  organization_id,
  environment_type
);


-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.users (
  id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  legacy_mongo_id TEXT,

  full_name TEXT NOT NULL,

  email TEXT NOT NULL,

  normalized_email TEXT NOT NULL,

  status TEXT NOT NULL
    DEFAULT 'pending_verification',

  email_verified_at TIMESTAMPTZ,

  primary_organization_id UUID
    REFERENCES tenancy.organizations(id)
    ON DELETE SET NULL,

  last_login_at TIMESTAMPTZ,

  metadata JSONB NOT NULL
    DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CONSTRAINT identity_users_public_id_unique
    UNIQUE (
      public_id
    ),

  CONSTRAINT identity_users_legacy_mongo_id_unique
    UNIQUE (
      legacy_mongo_id
    ),

  CONSTRAINT identity_users_normalized_email_unique
    UNIQUE (
      normalized_email
    ),

  CONSTRAINT identity_users_status_check
    CHECK (
      status IN (
        'pending_verification',
        'active',
        'suspended',
        'disabled'
      )
    )
);


CREATE INDEX IF NOT EXISTS
  idx_identity_users_primary_org
ON identity.users (
  primary_organization_id
);


CREATE INDEX IF NOT EXISTS
  idx_identity_users_status
ON identity.users (
  status
);


-- ============================================================================
-- PASSWORD CREDENTIALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.password_credentials (
  id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

  legacy_mongo_id TEXT,

  user_id UUID NOT NULL
    REFERENCES identity.users(id)
    ON DELETE CASCADE,

  password_hash TEXT NOT NULL,

  algorithm TEXT NOT NULL
    DEFAULT 'argon2id',

  hash_version INTEGER NOT NULL
    DEFAULT 1,

  password_changed_at TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  failed_attempts INTEGER NOT NULL
    DEFAULT 0,

  locked_until TIMESTAMPTZ,

  last_failed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CONSTRAINT password_credentials_user_unique
    UNIQUE (
      user_id
    ),

  CONSTRAINT password_credentials_legacy_unique
    UNIQUE (
      legacy_mongo_id
    ),

  CONSTRAINT password_credentials_algorithm_check
    CHECK (
      algorithm = 'argon2id'
    ),

  CONSTRAINT password_credentials_hash_version_check
    CHECK (
      hash_version >= 1
    ),

  CONSTRAINT password_credentials_failed_attempts_check
    CHECK (
      failed_attempts >= 0
    ),

  CONSTRAINT password_credentials_hash_check
    CHECK (
      password_hash LIKE '$argon2%'
    )
);


-- ============================================================================
-- ORGANIZATION MEMBERSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.organization_memberships (
  id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  legacy_mongo_id TEXT,

  user_id UUID NOT NULL
    REFERENCES identity.users(id)
    ON DELETE CASCADE,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  role TEXT NOT NULL,

  status TEXT NOT NULL
    DEFAULT 'invited',

  project_ids JSONB NOT NULL
    DEFAULT '[]'::jsonb,

  invited_by_user_id UUID
    REFERENCES identity.users(id)
    ON DELETE SET NULL,

  joined_at TIMESTAMPTZ,

  suspended_at TIMESTAMPTZ,

  metadata JSONB NOT NULL
    DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CONSTRAINT organization_memberships_public_unique
    UNIQUE (
      public_id
    ),

  CONSTRAINT organization_memberships_legacy_unique
    UNIQUE (
      legacy_mongo_id
    ),

  CONSTRAINT organization_memberships_user_org_unique
    UNIQUE (
      user_id,
      organization_id
    ),

  CONSTRAINT organization_memberships_status_check
    CHECK (
      status IN (
        'invited',
        'active',
        'suspended',
        'removed'
      )
    )
);


CREATE INDEX IF NOT EXISTS
  idx_memberships_org_status
ON identity.organization_memberships (
  organization_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_memberships_user_status
ON identity.organization_memberships (
  user_id,
  status
);


-- ============================================================================
-- USER SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.user_sessions (
  id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  legacy_mongo_id TEXT,

  user_id UUID NOT NULL
    REFERENCES identity.users(id)
    ON DELETE CASCADE,

  active_organization_id UUID
    REFERENCES tenancy.organizations(id)
    ON DELETE SET NULL,

  token_hash TEXT NOT NULL,

  status TEXT NOT NULL
    DEFAULT 'active',

  last_activity_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  idle_expires_at TIMESTAMPTZ NOT NULL,

  absolute_expires_at TIMESTAMPTZ NOT NULL,

  revoked_at TIMESTAMPTZ,

  revocation_reason TEXT,

  ip_hash TEXT,

  user_agent_hash TEXT,

  device_id TEXT,

  device_label TEXT,

  authentication_methods JSONB NOT NULL
    DEFAULT '["password"]'::jsonb,

  assurance_level TEXT NOT NULL
    DEFAULT 'aal1',

  remember_me BOOLEAN NOT NULL
    DEFAULT FALSE,

  csrf_secret TEXT,

  metadata JSONB NOT NULL
    DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CONSTRAINT user_sessions_public_unique
    UNIQUE (
      public_id
    ),

  CONSTRAINT user_sessions_legacy_unique
    UNIQUE (
      legacy_mongo_id
    ),

  CONSTRAINT user_sessions_token_hash_unique
    UNIQUE (
      token_hash
    ),

  CONSTRAINT user_sessions_status_check
    CHECK (
      status IN (
        'active',
        'revoked',
        'expired'
      )
    ),

  CONSTRAINT user_sessions_assurance_check
    CHECK (
      assurance_level IN (
        'aal1',
        'aal2',
        'aal3'
      )
    )
);


CREATE INDEX IF NOT EXISTS
  idx_user_sessions_user_status
ON identity.user_sessions (
  user_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_user_sessions_idle_expiry
ON identity.user_sessions (
  idle_expires_at
);


CREATE INDEX IF NOT EXISTS
  idx_user_sessions_absolute_expiry
ON identity.user_sessions (
  absolute_expires_at
);


-- ============================================================================
-- EMAIL VERIFICATION TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  identity.email_verification_tokens (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    legacy_mongo_id TEXT,

    user_id UUID NOT NULL
      REFERENCES identity.users(id)
      ON DELETE CASCADE,

    token_hash TEXT NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT email_verification_tokens_legacy_unique
      UNIQUE (
        legacy_mongo_id
      ),

    CONSTRAINT email_verification_tokens_hash_unique
      UNIQUE (
        token_hash
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_email_verification_user
ON identity.email_verification_tokens (
  user_id
);


CREATE INDEX IF NOT EXISTS
  idx_email_verification_expiry
ON identity.email_verification_tokens (
  expires_at
);


-- ============================================================================
-- PASSWORD RESET TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  identity.password_reset_tokens (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    legacy_mongo_id TEXT,

    user_id UUID NOT NULL
      REFERENCES identity.users(id)
      ON DELETE CASCADE,

    token_hash TEXT NOT NULL,

    expires_at TIMESTAMPTZ NOT NULL,

    used_at TIMESTAMPTZ,

    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT password_reset_tokens_legacy_unique
      UNIQUE (
        legacy_mongo_id
      ),

    CONSTRAINT password_reset_tokens_hash_unique
      UNIQUE (
        token_hash
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_password_reset_user
ON identity.password_reset_tokens (
  user_id
);


CREATE INDEX IF NOT EXISTS
  idx_password_reset_expiry
ON identity.password_reset_tokens (
  expires_at
);


-- ============================================================================
-- TENANT CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  tenancy.tenant_configs (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    tenant_id UUID
      REFERENCES tenancy.tenants(id)
      ON DELETE CASCADE,

    tenant_public_id TEXT NOT NULL,

    legacy_mongo_id TEXT,

    name TEXT,

    status TEXT NOT NULL
      DEFAULT 'active',

    policy_version INTEGER,

    settings JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    api_keys JSONB NOT NULL
      DEFAULT '[]'::jsonb,

    admins JSONB NOT NULL
      DEFAULT '[]'::jsonb,

    retention JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    document JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT tenant_configs_public_unique
      UNIQUE (
        tenant_public_id
      ),

    CONSTRAINT tenant_configs_legacy_unique
      UNIQUE (
        legacy_mongo_id
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_tenant_configs_status
ON tenancy.tenant_configs (
  status
);


-- ============================================================================
-- AUTHENTICATION AUDIT EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  identity.authentication_audit_events (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    event_id TEXT NOT NULL,

    legacy_mongo_id TEXT,

    user_id UUID
      REFERENCES identity.users(id)
      ON DELETE SET NULL,

    organization_id UUID
      REFERENCES tenancy.organizations(id)
      ON DELETE SET NULL,

    session_id UUID
      REFERENCES identity.user_sessions(id)
      ON DELETE SET NULL,

    event_type TEXT NOT NULL,

    outcome TEXT NOT NULL,

    reason_code TEXT,

    request_id TEXT,

    correlation_id TEXT,

    ip_hash TEXT,

    user_agent_hash TEXT,

    chain_index BIGINT NOT NULL,

    previous_event_hash TEXT,

    signature TEXT NOT NULL,

    event_hash TEXT NOT NULL,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT authentication_audit_event_id_unique
      UNIQUE (
        event_id
      ),

    CONSTRAINT authentication_audit_legacy_unique
      UNIQUE (
        legacy_mongo_id
      ),

    CONSTRAINT authentication_audit_chain_unique
      UNIQUE (
        chain_index
      ),

    CONSTRAINT authentication_audit_hash_unique
      UNIQUE (
        event_hash
      ),

    CONSTRAINT authentication_audit_chain_positive
      CHECK (
        chain_index >= 1
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_auth_audit_user_created
ON identity.authentication_audit_events (
  user_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_auth_audit_org_created
ON identity.authentication_audit_events (
  organization_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_auth_audit_type_created
ON identity.authentication_audit_events (
  event_type,
  created_at DESC
);


-- ============================================================================
-- ORGANIZATION / USER CROSS REFERENCES
-- ============================================================================

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'organizations_created_by_user_fk'
  ) THEN
    ALTER TABLE tenancy.organizations
      ADD CONSTRAINT organizations_created_by_user_fk
      FOREIGN KEY (
        created_by_user_id
      )
      REFERENCES identity.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;


ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

ALTER TABLE tenancy.environments
  ADD COLUMN IF NOT EXISTS archived_by_user_id UUID;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'environments_created_by_user_fk'
  ) THEN
    ALTER TABLE tenancy.environments
      ADD CONSTRAINT environments_created_by_user_fk
      FOREIGN KEY (
        created_by_user_id
      )
      REFERENCES identity.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'environments_archived_by_user_fk'
  ) THEN
    ALTER TABLE tenancy.environments
      ADD CONSTRAINT environments_archived_by_user_fk
      FOREIGN KEY (
        archived_by_user_id
      )
      REFERENCES identity.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;


-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS
  trg_identity_users_updated_at
ON identity.users;

CREATE TRIGGER
  trg_identity_users_updated_at
BEFORE UPDATE
ON identity.users
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_password_credentials_updated_at
ON identity.password_credentials;

CREATE TRIGGER
  trg_password_credentials_updated_at
BEFORE UPDATE
ON identity.password_credentials
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_memberships_updated_at
ON identity.organization_memberships;

CREATE TRIGGER
  trg_memberships_updated_at
BEFORE UPDATE
ON identity.organization_memberships
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_user_sessions_updated_at
ON identity.user_sessions;

CREATE TRIGGER
  trg_user_sessions_updated_at
BEFORE UPDATE
ON identity.user_sessions
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_tenant_configs_updated_at
ON tenancy.tenant_configs;

CREATE TRIGGER
  trg_tenant_configs_updated_at
BEFORE UPDATE
ON tenancy.tenant_configs
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON SCHEMA identity IS
  'AIRA human identity, authentication, sessions, credentials and identity audit data.';

COMMENT ON TABLE identity.users IS
  'Canonical AIRA human users after MongoDB retirement.';

COMMENT ON TABLE identity.password_credentials IS
  'Argon2id password credentials. Password hashes must never be exposed through API serialization.';

COMMENT ON TABLE identity.user_sessions IS
  'Server-side login sessions. Stores only token hashes, never raw session tokens.';

COMMENT ON TABLE tenancy.tenant_configs IS
  'Compatibility configuration for tenant-scoped machine APIs during the Phase 13 migration.';
  