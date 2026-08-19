-- ============================================================================
-- AIRA PHASE 13.3
-- MIGRATION 0004 — POLICY + APPROVAL + AUDIT + WORKFLOW
-- ============================================================================

-- ============================================================================
-- POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  tenant_public_id TEXT,

  organization_id UUID
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'active',

  active_version INTEGER,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT policies_public_unique
    UNIQUE (public_id)
);

CREATE TABLE IF NOT EXISTS policy.policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  policy_id UUID NOT NULL
    REFERENCES policy.policies(id)
    ON DELETE CASCADE,

  version INTEGER NOT NULL,

  status TEXT NOT NULL,

  definition JSONB NOT NULL,

  checksum TEXT,

  created_by TEXT,

  reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT policy_versions_unique
    UNIQUE (
      policy_id,
      version
    ),

  CONSTRAINT policy_versions_version_positive
    CHECK (
      version >= 1
    )
);

CREATE INDEX IF NOT EXISTS
  idx_policy_versions_status
ON policy.policy_versions (
  policy_id,
  status,
  version DESC
);

-- ============================================================================
-- APPROVAL REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,
  legacy_mongo_id TEXT,

  tenant_public_id TEXT NOT NULL,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID
    REFERENCES incidents.incidents(id)
    ON DELETE SET NULL,

  decision_id TEXT NOT NULL,
  correlation_id TEXT,

  action TEXT NOT NULL,
  reason TEXT,

  severity TEXT,

  confidence NUMERIC(5,4),

  resource JSONB NOT NULL DEFAULT '{}'::jsonb,
  namespace TEXT,

  additional_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_trace JSONB,

  status TEXT NOT NULL DEFAULT 'pending',

  requested_by TEXT,

  approved_by TEXT,
  approved_at TIMESTAMPTZ,

  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  expires_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT approvals_public_unique
    UNIQUE (public_id),

  CONSTRAINT approvals_confidence_range
    CHECK (
      confidence IS NULL OR
      (
        confidence >= 0 AND
        confidence <= 1
      )
    )
);

CREATE INDEX IF NOT EXISTS
  idx_approvals_pending
ON execution.approvals (
  organization_id,
  environment_id,
  status,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_approvals_decision
ON execution.approvals (
  organization_id,
  environment_id,
  decision_id
);

CREATE INDEX IF NOT EXISTS
  idx_approvals_correlation
ON execution.approvals (
  organization_id,
  environment_id,
  correlation_id
);

CREATE INDEX IF NOT EXISTS
  idx_approvals_incident
ON execution.approvals (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_approvals_expiry
ON execution.approvals (
  expires_at
)
WHERE status = 'pending';

-- ============================================================================
-- DECISION TRACES
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit.decision_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  tenant_public_id TEXT NOT NULL,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID
    REFERENCES incidents.incidents(id)
    ON DELETE SET NULL,

  correlation_id TEXT,

  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasoning JSONB,
  rules_triggered JSONB NOT NULL DEFAULT '[]'::jsonb,
  alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,

  decision TEXT,
  recommended_action TEXT,

  tier TEXT,
  action_risk TEXT,

  policy_check JSONB,
  action_result JSONB,
  memory_update JSONB,

  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT decision_traces_public_unique
    UNIQUE (public_id)
);

CREATE INDEX IF NOT EXISTS
  idx_decision_traces_scope_created
ON audit.decision_traces (
  tenant_public_id,
  organization_id,
  environment_id,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_decision_traces_incident
ON audit.decision_traces (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);

-- ============================================================================
-- IMMUTABLE AUDIT EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  tenant_public_id TEXT NOT NULL,

  event_type TEXT NOT NULL,

  principal TEXT,
  principal_id TEXT,
  user_id TEXT,

  correlation_id TEXT,

  ip_address TEXT,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  signature TEXT NOT NULL,

  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'created',

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_events_public_unique
    UNIQUE (public_id),

  CONSTRAINT audit_events_hash_unique
    UNIQUE (event_hash)
);

CREATE INDEX IF NOT EXISTS
  idx_audit_events_tenant_time
ON audit.audit_events (
  tenant_public_id,
  occurred_at ASC
);

CREATE INDEX IF NOT EXISTS
  idx_audit_events_correlation
ON audit.audit_events (
  tenant_public_id,
  correlation_id,
  occurred_at ASC
);

CREATE INDEX IF NOT EXISTS
  idx_audit_events_type
ON audit.audit_events (
  tenant_public_id,
  event_type,
  occurred_at DESC
);

-- ============================================================================
-- IMMUTABILITY GUARD
-- ============================================================================

CREATE OR REPLACE FUNCTION audit.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AIRA audit events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS
  trg_audit_events_immutable_update
ON audit.audit_events;

CREATE TRIGGER
  trg_audit_events_immutable_update
BEFORE UPDATE
ON audit.audit_events
FOR EACH ROW
EXECUTE FUNCTION
  audit.prevent_audit_mutation();

DROP TRIGGER IF EXISTS
  trg_audit_events_immutable_delete
ON audit.audit_events;

CREATE TRIGGER
  trg_audit_events_immutable_delete
BEFORE DELETE
ON audit.audit_events
FOR EACH ROW
EXECUTE FUNCTION
  audit.prevent_audit_mutation();

-- ============================================================================
-- WORKFLOW OUTBOX
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  tenant_public_id TEXT,

  organization_id UUID
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  incident_id UUID
    REFERENCES incidents.incidents(id)
    ON DELETE SET NULL,

  event_type TEXT NOT NULL,

  aggregate_type TEXT,
  aggregate_id TEXT,

  correlation_id TEXT,

  status TEXT NOT NULL DEFAULT 'pending',

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  owner_worker_id TEXT,
  owner_claim_token TEXT,
  owner_claimed_at TIMESTAMPTZ,
  owner_heartbeat_at TIMESTAMPTZ,
  owner_lease_expires_at TIMESTAMPTZ,

  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,

  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,

  delivered_at TIMESTAMPTZ,

  message_id TEXT,
  queue TEXT,
  exchange TEXT,
  routing_key TEXT,

  failure_code TEXT,
  failure_message TEXT,
  failure_retryable BOOLEAN NOT NULL DEFAULT FALSE,
  failed_at TIMESTAMPTZ,

  idempotency_key TEXT,

  execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT outbox_events_public_unique
    UNIQUE (public_id),

  CONSTRAINT outbox_attempt_nonnegative
    CHECK (
      attempt_count >= 0
    ),

  CONSTRAINT outbox_max_attempt_positive
    CHECK (
      max_attempts >= 1
    ),

  CONSTRAINT outbox_never_authorizes_execution
    CHECK (
      execution_authorized = FALSE
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_outbox_idempotency_unique
ON workflow.outbox_events (
  organization_id,
  environment_id,
  idempotency_key
)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_outbox_delivery_queue
ON workflow.outbox_events (
  status,
  next_attempt_at,
  created_at
);

CREATE INDEX IF NOT EXISTS
  idx_outbox_lease
ON workflow.outbox_events (
  status,
  owner_lease_expires_at
);

CREATE INDEX IF NOT EXISTS
  idx_outbox_incident
ON workflow.outbox_events (
  organization_id,
  environment_id,
  incident_id,
  created_at
);

-- ============================================================================
-- UPDATED_AT
-- ============================================================================

CREATE TRIGGER trg_policies_updated_at
BEFORE UPDATE
ON policy.policies
FOR EACH ROW
EXECUTE FUNCTION public.aira_set_updated_at();

CREATE TRIGGER trg_approvals_updated_at
BEFORE UPDATE
ON execution.approvals
FOR EACH ROW
EXECUTE FUNCTION public.aira_set_updated_at();

CREATE TRIGGER trg_decision_traces_updated_at
BEFORE UPDATE
ON audit.decision_traces
FOR EACH ROW
EXECUTE FUNCTION public.aira_set_updated_at();

CREATE TRIGGER trg_outbox_events_updated_at
BEFORE UPDATE
ON workflow.outbox_events
FOR EACH ROW
EXECUTE FUNCTION public.aira_set_updated_at();