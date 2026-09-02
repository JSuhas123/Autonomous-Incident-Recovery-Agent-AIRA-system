-- ============================================================================
-- AIRA PHASE 23.2C + 23.2D
-- ESCALATION RELIABILITY + LEGACY CUTOVER
-- MIGRATION 0090
-- ============================================================================
--
-- Adds durable acknowledgement-timeout / retry state to Phase 23 escalation
-- records and an immutable escalation event stream.
--
-- Safety laws:
--
--   ESCALATION RETRY != EXECUTION AUTHORIZATION
--   ACK TIMEOUT != HUMAN CONTROL
--   RETRY EXHAUSTION != EXECUTION AUTHORIZATION
--   LEGACY ESCALATED STATUS MUST NOT RE-ENTER THE PHASE-23 DOMAIN
-- ============================================================================


BEGIN;


ALTER TABLE
  human_operations.escalations
ADD COLUMN IF NOT EXISTS
  delivery_attempt_count INTEGER NOT NULL DEFAULT 0;


ALTER TABLE
  human_operations.escalations
ADD COLUMN IF NOT EXISTS
  max_delivery_attempts INTEGER NOT NULL DEFAULT 3;


ALTER TABLE
  human_operations.escalations
ADD COLUMN IF NOT EXISTS
  acknowledgement_timeout_count INTEGER NOT NULL DEFAULT 0;


ALTER TABLE
  human_operations.escalations
ADD COLUMN IF NOT EXISTS
  last_delivery_attempt_at TIMESTAMPTZ;


ALTER TABLE
  human_operations.escalations
ADD COLUMN IF NOT EXISTS
  next_delivery_attempt_at TIMESTAMPTZ;


ALTER TABLE
  human_operations.escalations
DROP CONSTRAINT IF EXISTS
  escalation_delivery_attempt_count_nonnegative;


ALTER TABLE
  human_operations.escalations
ADD CONSTRAINT
  escalation_delivery_attempt_count_nonnegative
CHECK (
  delivery_attempt_count >= 0
);


ALTER TABLE
  human_operations.escalations
DROP CONSTRAINT IF EXISTS
  escalation_max_delivery_attempts_positive;


ALTER TABLE
  human_operations.escalations
ADD CONSTRAINT
  escalation_max_delivery_attempts_positive
CHECK (
  max_delivery_attempts > 0
);


ALTER TABLE
  human_operations.escalations
DROP CONSTRAINT IF EXISTS
  escalation_ack_timeout_count_nonnegative;


ALTER TABLE
  human_operations.escalations
ADD CONSTRAINT
  escalation_ack_timeout_count_nonnegative
CHECK (
  acknowledgement_timeout_count >= 0
);


CREATE INDEX IF NOT EXISTS
  idx_escalations_ack_timeout_due
ON human_operations.escalations (
  organization_id,
  environment_id,
  acknowledgement_deadline,
  created_at
)
WHERE
  status = 'WAITING_ACK'
  AND acknowledgement_deadline IS NOT NULL;


CREATE INDEX IF NOT EXISTS
  idx_escalations_retry_due
ON human_operations.escalations (
  organization_id,
  environment_id,
  next_delivery_attempt_at,
  created_at
)
WHERE
  status IN (
    'ROUTED',
    'WAITING_ACK'
  )
  AND next_delivery_attempt_at IS NOT NULL;


-- Exactly one canonical Phase-23 HumanTask may exist for one escalation
-- public reference.
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_human_tasks_one_per_escalation
ON human_operations.tasks (
  organization_id,
  environment_id,
  escalation_id
)
WHERE
  escalation_id IS NOT NULL;


-- ============================================================================
-- ESCALATION EVENT STREAM
-- ============================================================================

CREATE TABLE IF NOT EXISTS
  human_operations.escalation_events (
    id UUID PRIMARY KEY
      DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
      REFERENCES tenancy.organizations(id)
      ON DELETE CASCADE,

    environment_id UUID NOT NULL
      REFERENCES tenancy.environments(id)
      ON DELETE CASCADE,

    escalation_id UUID NOT NULL,

    incident_id TEXT NOT NULL,

    task_id UUID,

    event_type TEXT NOT NULL,

    attempt_number INTEGER NOT NULL
      DEFAULT 0,

    target_id UUID,

    actor_user_id UUID
      REFERENCES identity.users(id)
      ON DELETE RESTRICT,

    metadata JSONB NOT NULL
      DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL
      DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL
      DEFAULT NOW(),

    CONSTRAINT escalation_event_public_unique
      UNIQUE (
        public_id
      ),

    CONSTRAINT escalation_event_scope_id_unique
      UNIQUE (
        organization_id,
        environment_id,
        id
      ),

    CONSTRAINT escalation_event_escalation_scope_fk
      FOREIGN KEY (
        organization_id,
        environment_id,
        escalation_id
      )
      REFERENCES human_operations.escalations (
        organization_id,
        environment_id,
        id
      )
      ON DELETE CASCADE,

    CONSTRAINT escalation_event_task_scope_fk
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

    CONSTRAINT escalation_event_target_scope_fk
      FOREIGN KEY (
        organization_id,
        environment_id,
        target_id
      )
      REFERENCES human_operations.on_call_targets (
        organization_id,
        environment_id,
        id
      )
      ON DELETE RESTRICT,

    CONSTRAINT escalation_event_attempt_nonnegative
      CHECK (
        attempt_number >= 0
      ),

    CONSTRAINT escalation_event_metadata_object
      CHECK (
        jsonb_typeof(
          metadata
        ) = 'object'
      ),

    CONSTRAINT escalation_event_never_authorizes_execution
      CHECK (
        execution_authorized = FALSE
      )
  );


CREATE INDEX IF NOT EXISTS
  idx_escalation_events_escalation
ON human_operations.escalation_events (
  organization_id,
  environment_id,
  escalation_id,
  created_at,
  id
);


CREATE INDEX IF NOT EXISTS
  idx_escalation_events_incident
ON human_operations.escalation_events (
  organization_id,
  environment_id,
  incident_id,
  created_at,
  id
);


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE
  human_operations.escalation_events
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
  human_operations.escalation_events
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
  human_operations_tenant_policy
ON human_operations.escalation_events;


CREATE POLICY
  human_operations_tenant_policy
ON human_operations.escalation_events
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


COMMIT;