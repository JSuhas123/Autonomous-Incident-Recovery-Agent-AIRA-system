-- ============================================================================
-- AIRA PHASE 23.2
-- HUMAN ESCALATION ENGINE
-- MIGRATION 0089
-- ============================================================================
--
-- Canonical persistence for:
--
--   EscalationPolicy
--   OnCallTarget
--   EscalationRecord
--
-- Safety laws:
--
--   ESCALATION != EXECUTION AUTHORIZATION
--   ROUTING != EXECUTION AUTHORIZATION
--   ON-CALL TARGET != EXECUTION AUTHORIZATION
--
-- PostgreSQL remains authoritative.
-- Redis must never become escalation/control authority.
-- Notification delivery is added separately in Phase 23.3.
-- ============================================================================


BEGIN;


CREATE SCHEMA IF NOT EXISTS
  human_operations;


-- ============================================================================
-- ESCALATION POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  human_operations.escalation_policies (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
      REFERENCES tenancy.organizations(id)
      ON DELETE CASCADE,

    environment_id UUID NOT NULL
      REFERENCES tenancy.environments(id)
      ON DELETE CASCADE,

    policy_key TEXT NOT NULL,

    name TEXT NOT NULL,

    description TEXT NOT NULL
      DEFAULT '',

    enabled BOOLEAN NOT NULL
      DEFAULT TRUE,

    priority INTEGER NOT NULL
      DEFAULT 100,

    match_conditions JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    acknowledgement_timeout_seconds INTEGER NOT NULL
      DEFAULT 900,

    max_delivery_attempts INTEGER NOT NULL
      DEFAULT 3,

    create_human_task BOOLEAN NOT NULL
      DEFAULT TRUE,

    block_autonomous_recovery BOOLEAN NOT NULL
      DEFAULT TRUE,

    metadata JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL
      DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT escalation_policy_public_unique
      UNIQUE (
        public_id
      ),

    CONSTRAINT escalation_policy_scope_key_unique
      UNIQUE (
        organization_id,
        environment_id,
        policy_key
      ),

    CONSTRAINT escalation_policy_scope_id_unique
      UNIQUE (
        organization_id,
        environment_id,
        id
      ),

    CONSTRAINT escalation_policy_priority_nonnegative
      CHECK (
        priority >= 0
      ),

    CONSTRAINT escalation_policy_ack_timeout_positive
      CHECK (
        acknowledgement_timeout_seconds > 0
      ),

    CONSTRAINT escalation_policy_attempts_positive
      CHECK (
        max_delivery_attempts > 0
      ),

    CONSTRAINT escalation_policy_conditions_object
      CHECK (
        jsonb_typeof(
          match_conditions
        ) = 'object'
      ),

    CONSTRAINT escalation_policy_metadata_object
      CHECK (
        jsonb_typeof(
          metadata
        ) = 'object'
      ),

    CONSTRAINT escalation_policy_never_authorizes_execution
      CHECK (
        execution_authorized = FALSE
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_escalation_policies_scope_enabled_priority
ON human_operations.escalation_policies (
  organization_id,
  environment_id,
  enabled,
  priority,
  created_at
);


-- ============================================================================
-- ON-CALL TARGETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  human_operations.on_call_targets (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
      REFERENCES tenancy.organizations(id)
      ON DELETE CASCADE,

    environment_id UUID NOT NULL
      REFERENCES tenancy.environments(id)
      ON DELETE CASCADE,

    target_key TEXT NOT NULL,

    name TEXT NOT NULL,

    target_type TEXT NOT NULL,

    target_user_id UUID
      REFERENCES identity.users(id)
      ON DELETE RESTRICT,

    target_team_id UUID
      REFERENCES tenancy.teams(id)
      ON DELETE RESTRICT,

    integration_ref TEXT,

    routing_key TEXT,

    channels JSONB NOT NULL
      DEFAULT '[]'::jsonb,

    enabled BOOLEAN NOT NULL
      DEFAULT TRUE,

    priority INTEGER NOT NULL
      DEFAULT 100,

    metadata JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL
      DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT on_call_target_public_unique
      UNIQUE (
        public_id
      ),

    CONSTRAINT on_call_target_scope_key_unique
      UNIQUE (
        organization_id,
        environment_id,
        target_key
      ),

    CONSTRAINT on_call_target_scope_id_unique
      UNIQUE (
        organization_id,
        environment_id,
        id
      ),

    CONSTRAINT on_call_target_type_check
      CHECK (
        target_type IN (
          'USER',
          'TEAM',
          'INTEGRATION'
        )
      ),

    CONSTRAINT on_call_target_priority_nonnegative
      CHECK (
        priority >= 0
      ),

    CONSTRAINT on_call_target_channels_array
      CHECK (
        jsonb_typeof(
          channels
        ) = 'array'
      ),

    CONSTRAINT on_call_target_metadata_object
      CHECK (
        jsonb_typeof(
          metadata
        ) = 'object'
      ),

    CONSTRAINT on_call_target_shape_check
      CHECK (
        (
          target_type = 'USER'
          AND target_user_id IS NOT NULL
        )
        OR
        (
          target_type = 'TEAM'
          AND target_team_id IS NOT NULL
        )
        OR
        (
          target_type = 'INTEGRATION'
          AND integration_ref IS NOT NULL
        )
      ),

    CONSTRAINT on_call_target_never_authorizes_execution
      CHECK (
        execution_authorized = FALSE
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_on_call_targets_scope_enabled_priority
ON human_operations.on_call_targets (
  organization_id,
  environment_id,
  enabled,
  priority,
  created_at
);


-- ============================================================================
-- ESCALATION RECORDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  human_operations.escalations (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
      REFERENCES tenancy.organizations(id)
      ON DELETE CASCADE,

    environment_id UUID NOT NULL
      REFERENCES tenancy.environments(id)
      ON DELETE CASCADE,

    incident_id TEXT NOT NULL,

    task_id UUID,

    policy_id UUID,

    selected_target_id UUID,

    decision TEXT NOT NULL,

    reason_code TEXT NOT NULL,

    severity TEXT,

    trigger_source TEXT NOT NULL,

    status TEXT NOT NULL
      DEFAULT 'DECIDED',

    decision_snapshot JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    routing_snapshot JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    acknowledgement_deadline TIMESTAMPTZ,

    created_by_user_id UUID
      REFERENCES identity.users(id)
      ON DELETE RESTRICT,

    metadata JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL
      DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    resolved_at TIMESTAMPTZ,

    expired_at TIMESTAMPTZ,

    cancelled_at TIMESTAMPTZ,

    CONSTRAINT escalation_public_unique
      UNIQUE (
        public_id
      ),

    CONSTRAINT escalation_scope_id_unique
      UNIQUE (
        organization_id,
        environment_id,
        id
      ),

    CONSTRAINT escalation_task_scope_fk
      FOREIGN KEY (
        organization_id,
        environment_id,
        task_id
      )
      REFERENCES human_operations.tasks (
        organization_id,
        environment_id,
        id
      )
      ON DELETE RESTRICT,

    CONSTRAINT escalation_policy_scope_fk
      FOREIGN KEY (
        organization_id,
        environment_id,
        policy_id
      )
      REFERENCES human_operations.escalation_policies (
        organization_id,
        environment_id,
        id
      )
      ON DELETE RESTRICT,

    CONSTRAINT escalation_target_scope_fk
      FOREIGN KEY (
        organization_id,
        environment_id,
        selected_target_id
      )
      REFERENCES human_operations.on_call_targets (
        organization_id,
        environment_id,
        id
      )
      ON DELETE RESTRICT,

    CONSTRAINT escalation_decision_check
      CHECK (
        decision IN (
          'ESCALATE',
          'NO_ESCALATION'
        )
      ),

    CONSTRAINT escalation_reason_check
      CHECK (
        reason_code IN (
          'RECOVERY_UNSAFE',
          'INSUFFICIENT_EVIDENCE',
          'APPROVAL_REQUIRED',
          'AUTONOMY_NOT_ELIGIBLE',
          'RECOVERY_FAILED',
          'VERIFICATION_FAILED',
          'CONTROL_REQUIRED',
          'POLICY_ESCALATION',
          'MANUAL_ESCALATION'
        )
      ),

    CONSTRAINT escalation_trigger_source_check
      CHECK (
        trigger_source IN (
          'RECOVERY_ENGINE',
          'VERIFICATION_ENGINE',
          'APPROVAL_ENGINE',
          'AUTONOMY_GATE',
          'HUMAN_OPERATOR',
          'INCIDENT_COMMAND',
          'SYSTEM_POLICY'
        )
      ),

    CONSTRAINT escalation_status_check
      CHECK (
        status IN (
          'DECIDED',
          'ROUTED',
          'WAITING_ACK',
          'ACKNOWLEDGED',
          'RESOLVED',
          'EXPIRED',
          'FAILED',
          'CANCELLED'
        )
      ),

    CONSTRAINT escalation_decision_snapshot_object
      CHECK (
        jsonb_typeof(
          decision_snapshot
        ) = 'object'
      ),

    CONSTRAINT escalation_routing_snapshot_object
      CHECK (
        jsonb_typeof(
          routing_snapshot
        ) = 'object'
      ),

    CONSTRAINT escalation_metadata_object
      CHECK (
        jsonb_typeof(
          metadata
        ) = 'object'
      ),

    CONSTRAINT escalation_never_authorizes_execution
      CHECK (
        execution_authorized = FALSE
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_escalations_incident
ON human_operations.escalations (
  organization_id,
  environment_id,
  incident_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_escalations_status
ON human_operations.escalations (
  organization_id,
  environment_id,
  status,
  created_at DESC
);


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS
  trg_escalation_policies_updated_at
ON human_operations.escalation_policies;


CREATE TRIGGER
  trg_escalation_policies_updated_at
BEFORE UPDATE
ON human_operations.escalation_policies
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_on_call_targets_updated_at
ON human_operations.on_call_targets;


CREATE TRIGGER
  trg_on_call_targets_updated_at
BEFORE UPDATE
ON human_operations.on_call_targets
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_escalations_updated_at
ON human_operations.escalations;


CREATE TRIGGER
  trg_escalations_updated_at
BEFORE UPDATE
ON human_operations.escalations
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'escalation_policies',
    'on_call_targets',
    'escalations'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE human_operations.%I ENABLE ROW LEVEL SECURITY',
      target_table
    );

    EXECUTE format(
      'ALTER TABLE human_operations.%I FORCE ROW LEVEL SECURITY',
      target_table
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS human_operations_tenant_policy ON human_operations.%I',
      target_table
    );

    EXECUTE format(
      $policy$
        CREATE POLICY human_operations_tenant_policy
        ON human_operations.%I

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
        )
      $policy$,
      target_table
    );
  END LOOP;
END
$$;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
  human_operations.escalation_policies
IS
  'Deterministic Phase-23 human escalation policies. Policies never authorize infrastructure execution.';


COMMENT ON TABLE
  human_operations.on_call_targets
IS
  'Tenant-scoped human/on-call routing targets. Routing never grants control or execution authority.';


COMMENT ON TABLE
  human_operations.escalations
IS
  'Canonical human escalation decision and routing lineage. Escalation never grants infrastructure execution authority.';


COMMIT;