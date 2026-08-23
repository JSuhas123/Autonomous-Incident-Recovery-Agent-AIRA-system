-- ============================================================================
-- AIRA PHASE 13.4E1
-- MIGRATION 0011 — POLICY + APPROVAL + AUDIT REPOSITORY PARITY
-- ============================================================================


-- ============================================================================
-- POLICY
-- ============================================================================

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS tenant_public_id TEXT;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS version INTEGER;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS enforcement_mode TEXT NOT NULL DEFAULT 'strict';

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS policy_yaml TEXT;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS policy_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS change_log TEXT NOT NULL DEFAULT '';

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS circuit_breakers JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS blackout_windows JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS approvals JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE policy.policies
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_policy_database_id_unique
ON policy.policies (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_policy_tenant_version_unique
ON policy.policies (
  tenant_public_id,
  version
)
WHERE
  tenant_public_id IS NOT NULL
  AND version IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_policy_one_active_per_tenant
ON policy.policies (
  tenant_public_id
)
WHERE
  tenant_public_id IS NOT NULL
  AND status = 'active';


CREATE INDEX IF NOT EXISTS
  idx_policy_document_gin
ON policy.policies
USING GIN (
  document
);


-- ============================================================================
-- POLICY TENANT RLS
-- ============================================================================

ALTER TABLE policy.policies
ENABLE ROW LEVEL SECURITY;

ALTER TABLE policy.policies
FORCE ROW LEVEL SECURITY;


CREATE POLICY policy_tenant_scope_policy
ON policy.policies
USING (
  tenant_public_id =
    tenancy.current_tenant_public_id()
)
WITH CHECK (
  tenant_public_id =
    tenancy.current_tenant_public_id()
);


-- ============================================================================
-- APPROVAL
-- ============================================================================

ALTER TABLE execution.approvals
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE execution.approvals
ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

ALTER TABLE execution.approvals
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_approval_database_id_unique
ON execution.approvals (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_approval_document_gin
ON execution.approvals
USING GIN (
  document
);


-- ============================================================================
-- AUDIT
-- ============================================================================

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS database_id TEXT;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES tenancy.organizations(id)
  ON DELETE SET NULL;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS environment_id UUID
  REFERENCES tenancy.environments(id)
  ON DELETE SET NULL;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS chain_index BIGINT;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS action TEXT;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS service_id TEXT;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS action_details JSONB;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE audit.audit_events
ADD COLUMN IF NOT EXISTS document JSONB NOT NULL DEFAULT '{}'::jsonb;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_audit_database_id_unique
ON audit.audit_events (
  database_id
)
WHERE database_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_audit_tenant_chain_index_unique
ON audit.audit_events (
  tenant_public_id,
  chain_index
)
WHERE chain_index IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_audit_org_environment
ON audit.audit_events (
  organization_id,
  environment_id,
  occurred_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_audit_document_gin
ON audit.audit_events
USING GIN (
  document
);