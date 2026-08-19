-- ============================================================================
-- AIRA PHASE 13.3
-- MIGRATION 0001 — PLATFORM FOUNDATION
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- DOMAIN SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS tenancy;
CREATE SCHEMA IF NOT EXISTS resources;
CREATE SCHEMA IF NOT EXISTS signals;
CREATE SCHEMA IF NOT EXISTS incidents;
CREATE SCHEMA IF NOT EXISTS agents;
CREATE SCHEMA IF NOT EXISTS policy;
CREATE SCHEMA IF NOT EXISTS execution;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS workflow;

-- ============================================================================
-- COMMON TIMESTAMP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.aira_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- TENANTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenancy.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  name TEXT,
  status TEXT NOT NULL DEFAULT 'active',

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tenants_public_id_unique
    UNIQUE (public_id),

  CONSTRAINT tenants_legacy_mongo_id_unique
    UNIQUE (legacy_mongo_id)
);

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenancy.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  tenant_id UUID REFERENCES tenancy.tenants(id)
    ON DELETE RESTRICT,

  name TEXT,
  status TEXT NOT NULL DEFAULT 'active',

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_public_id_unique
    UNIQUE (public_id),

  CONSTRAINT organizations_legacy_mongo_id_unique
    UNIQUE (legacy_mongo_id)
);

CREATE INDEX IF NOT EXISTS
  idx_organizations_tenant_status
ON tenancy.organizations (
  tenant_id,
  status
);

-- ============================================================================
-- ENVIRONMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenancy.environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  tenant_id UUID
    REFERENCES tenancy.tenants(id)
    ON DELETE RESTRICT,

  name TEXT,
  environment_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT environments_public_id_unique
    UNIQUE (public_id),

  CONSTRAINT environments_legacy_mongo_id_unique
    UNIQUE (legacy_mongo_id),

  CONSTRAINT environments_org_public_unique
    UNIQUE (
      organization_id,
      public_id
    )
);

CREATE INDEX IF NOT EXISTS
  idx_environments_org_status
ON tenancy.environments (
  organization_id,
  status
);

-- ============================================================================
-- GENERIC RESOURCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS resources.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  tenant_id UUID
    REFERENCES tenancy.tenants(id)
    ON DELETE RESTRICT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,

  external_id TEXT,
  name TEXT,

  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  discovered_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT resources_public_id_unique
    UNIQUE (public_id),

  CONSTRAINT resources_legacy_mongo_id_unique
    UNIQUE (legacy_mongo_id)
);

CREATE INDEX IF NOT EXISTS
  idx_resources_scope
ON resources.resources (
  organization_id,
  environment_id
);

CREATE INDEX IF NOT EXISTS
  idx_resources_provider_type
ON resources.resources (
  organization_id,
  environment_id,
  provider,
  resource_type
);

CREATE INDEX IF NOT EXISTS
  idx_resources_external
ON resources.resources (
  organization_id,
  environment_id,
  provider,
  external_id
);

CREATE INDEX IF NOT EXISTS
  idx_resources_labels_gin
ON resources.resources
USING GIN (
  labels
);

CREATE INDEX IF NOT EXISTS
  idx_resources_state_gin
ON resources.resources
USING GIN (
  current_state
);

-- ============================================================================
-- RESOURCE RELATIONSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS resources.resource_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  source_resource_id UUID NOT NULL
    REFERENCES resources.resources(id)
    ON DELETE CASCADE,

  target_resource_id UUID NOT NULL
    REFERENCES resources.resources(id)
    ON DELETE CASCADE,

  relationship_type TEXT NOT NULL,

  source TEXT,
  confidence NUMERIC(5,4),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,

  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT resource_relationships_public_unique
    UNIQUE (public_id),

  CONSTRAINT resource_relationships_no_self_reference
    CHECK (
      source_resource_id <>
      target_resource_id
    ),

  CONSTRAINT resource_relationships_confidence_range
    CHECK (
      confidence IS NULL OR
      (
        confidence >= 0 AND
        confidence <= 1
      )
    )
);

CREATE INDEX IF NOT EXISTS
  idx_resource_relationships_source
ON resources.resource_relationships (
  organization_id,
  environment_id,
  source_resource_id,
  relationship_type
);

CREATE INDEX IF NOT EXISTS
  idx_resource_relationships_target
ON resources.resource_relationships (
  organization_id,
  environment_id,
  target_resource_id,
  relationship_type
);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS
  trg_tenants_updated_at
ON tenancy.tenants;

CREATE TRIGGER
  trg_tenants_updated_at
BEFORE UPDATE
ON tenancy.tenants
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();

DROP TRIGGER IF EXISTS
  trg_organizations_updated_at
ON tenancy.organizations;

CREATE TRIGGER
  trg_organizations_updated_at
BEFORE UPDATE
ON tenancy.organizations
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();

DROP TRIGGER IF EXISTS
  trg_environments_updated_at
ON tenancy.environments;

CREATE TRIGGER
  trg_environments_updated_at
BEFORE UPDATE
ON tenancy.environments
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();

DROP TRIGGER IF EXISTS
  trg_resources_updated_at
ON resources.resources;

CREATE TRIGGER
  trg_resources_updated_at
BEFORE UPDATE
ON resources.resources
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();