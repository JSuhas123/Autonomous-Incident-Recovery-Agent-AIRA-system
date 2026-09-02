-- ============================================================================
-- AIRA PHASE 23.0 + 23.1
-- HUMAN TAKEOVER SAFETY + DOMAIN FOUNDATION
-- ============================================================================
--
-- SAFETY INVARIANTS
--
--   * Human takeover never manufactures autonomous execution authorization.
--   * Assignment and acknowledgement do not grant infrastructure control.
--   * PostgreSQL is authoritative for incident control ownership.
--   * At most one ACTIVE control lease may exist for an incident.
--   * Every table is organization/environment scoped and FORCE RLS protected.
--   * Return of control requires fresh evaluation.
--   * Stale-plan resume is forbidden.
--
-- This migration evolves the Phase 14.11 human_operations.tasks foundation.
-- Migration 0045 is intentionally retained unchanged as historical migration
-- evidence.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS human_operations;

-- ============================================================================
-- 1. UPGRADE EXISTING HUMAN TASK DOMAIN
-- ============================================================================

ALTER TABLE human_operations.tasks
    DROP CONSTRAINT IF EXISTS human_task_status_check;

UPDATE human_operations.tasks
SET status = 'WAITING'
WHERE status = 'ESCALATED';

ALTER TABLE human_operations.tasks
    ADD CONSTRAINT human_task_status_check
    CHECK (
        status IN (
            'OPEN',
            'ASSIGNED',
            'ACKNOWLEDGED',
            'IN_PROGRESS',
            'WAITING',
            'RESOLVED',
            'CANCELLED',
            'EXPIRED'
        )
    );

ALTER TABLE human_operations.tasks
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE human_operations.tasks
    ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE human_operations.tasks
    ADD COLUMN IF NOT EXISTS control_epoch BIGINT NOT NULL DEFAULT 0;

ALTER TABLE human_operations.tasks
    DROP CONSTRAINT IF EXISTS human_task_control_epoch_nonnegative;

ALTER TABLE human_operations.tasks
    ADD CONSTRAINT human_task_control_epoch_nonnegative
    CHECK (control_epoch >= 0);

ALTER TABLE human_operations.tasks
    DROP CONSTRAINT IF EXISTS human_tasks_scope_id_unique;

ALTER TABLE human_operations.tasks
    ADD CONSTRAINT human_tasks_scope_id_unique
    UNIQUE (
        organization_id,
        environment_id,
        id
    );

-- ============================================================================
-- 2. ASSIGNMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_operations.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    task_id UUID NOT NULL,

    assigned_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    assigned_team_id UUID
        REFERENCES tenancy.teams(id)
        ON DELETE SET NULL,

    assigned_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'ACTIVE',

    reason TEXT,

    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    ended_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT human_assignment_task_fk
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
        ON DELETE CASCADE,

    CONSTRAINT human_assignment_status_check
        CHECK (
            status IN (
                'ACTIVE',
                'REASSIGNED',
                'RELEASED',
                'EXPIRED'
            )
        ),

    CONSTRAINT human_assignment_target_check
        CHECK (
            assigned_user_id IS NOT NULL
            OR assigned_team_id IS NOT NULL
        ),

    CONSTRAINT human_assignment_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT human_assignment_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    UNIQUE (
        organization_id,
        environment_id,
        id
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_human_assignments_one_active
ON human_operations.assignments (
    organization_id,
    environment_id,
    task_id
)
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_human_assignments_target
ON human_operations.assignments (
    organization_id,
    environment_id,
    assigned_user_id,
    assigned_team_id,
    status
);

-- ============================================================================
-- 3. ACKNOWLEDGEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_operations.acknowledgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    task_id UUID NOT NULL,

    assignment_id UUID,

    acknowledged_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    outcome TEXT NOT NULL DEFAULT 'ACKNOWLEDGED',

    note TEXT,

    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT human_ack_task_fk
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
        ON DELETE CASCADE,

    CONSTRAINT human_ack_assignment_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            assignment_id
        )
        REFERENCES human_operations.assignments (
            organization_id,
            environment_id,
            id
        )
        ON DELETE SET NULL,

    CONSTRAINT human_ack_outcome_check
        CHECK (
            outcome IN (
                'ACKNOWLEDGED',
                'DECLINED',
                'TIMED_OUT'
            )
        ),

    CONSTRAINT human_ack_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT human_ack_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    UNIQUE (
        organization_id,
        environment_id,
        id
    )
);

CREATE INDEX IF NOT EXISTS idx_human_ack_task
ON human_operations.acknowledgements (
    organization_id,
    environment_id,
    task_id,
    acknowledged_at DESC
);

-- ============================================================================
-- 4. RESOLUTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_operations.resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    task_id UUID NOT NULL,

    incident_id TEXT,

    resolved_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    resolution_type TEXT NOT NULL DEFAULT 'MANUAL',

    summary TEXT,

    details JSONB NOT NULL DEFAULT '{}'::jsonb,

    verification_required BOOLEAN NOT NULL DEFAULT TRUE,

    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT human_resolution_task_fk
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
        ON DELETE CASCADE,

    CONSTRAINT human_resolution_details_object
        CHECK (
            jsonb_typeof(details) = 'object'
        ),

    CONSTRAINT human_resolution_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    UNIQUE (
        organization_id,
        environment_id,
        task_id
    ),

    UNIQUE (
        organization_id,
        environment_id,
        id
    )
);

CREATE INDEX IF NOT EXISTS idx_human_resolutions_incident
ON human_operations.resolutions (
    organization_id,
    environment_id,
    incident_id,
    resolved_at DESC
);

-- ============================================================================
-- 5. TAKEOVER SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_operations.takeover_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    incident_id TEXT NOT NULL,

    task_id UUID,

    requested_by_user_id UUID NOT NULL
        REFERENCES identity.users(id)
        ON DELETE RESTRICT,

    authorized_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'REQUESTED',

    reason TEXT,

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    authorized_at TIMESTAMPTZ,

    activated_at TIMESTAMPTZ,

    release_requested_at TIMESTAMPTZ,

    released_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ,

    revoked_at TIMESTAMPTZ,

    control_epoch BIGINT NOT NULL DEFAULT 0,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT human_takeover_task_fk
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
        ON DELETE SET NULL,

    CONSTRAINT human_takeover_status_check
        CHECK (
            status IN (
                'REQUESTED',
                'AUTHORIZED',
                'ACTIVE',
                'RELEASING',
                'RELEASED',
                'EXPIRED',
                'REVOKED',
                'DENIED'
            )
        ),

    CONSTRAINT human_takeover_epoch_nonnegative
        CHECK (
            control_epoch >= 0
        ),

    CONSTRAINT human_takeover_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT human_takeover_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    UNIQUE (
        organization_id,
        environment_id,
        id
    )
);

CREATE INDEX IF NOT EXISTS idx_human_takeover_incident
ON human_operations.takeover_sessions (
    organization_id,
    environment_id,
    incident_id,
    requested_at DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_human_takeover_one_active_session
ON human_operations.takeover_sessions (
    organization_id,
    environment_id,
    incident_id
)
WHERE status IN (
    'AUTHORIZED',
    'ACTIVE',
    'RELEASING'
);

-- ============================================================================
-- 6. CONTROL LEASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_operations.control_leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    incident_id TEXT NOT NULL,

    takeover_session_id UUID NOT NULL,

    holder_user_id UUID NOT NULL
        REFERENCES identity.users(id)
        ON DELETE RESTRICT,

    status TEXT NOT NULL DEFAULT 'PENDING',

    lease_version BIGINT NOT NULL DEFAULT 1,

    control_epoch BIGINT NOT NULL,

    acquired_at TIMESTAMPTZ,

    heartbeat_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    expires_at TIMESTAMPTZ NOT NULL,

    released_at TIMESTAMPTZ,

    revoked_at TIMESTAMPTZ,

    release_reason TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT human_control_lease_session_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            takeover_session_id
        )
        REFERENCES human_operations.takeover_sessions (
            organization_id,
            environment_id,
            id
        )
        ON DELETE CASCADE,

    CONSTRAINT human_control_lease_status_check
        CHECK (
            status IN (
                'PENDING',
                'ACTIVE',
                'RELEASED',
                'EXPIRED',
                'REVOKED'
            )
        ),

    CONSTRAINT human_control_lease_version_positive
        CHECK (
            lease_version > 0
        ),

    CONSTRAINT human_control_lease_epoch_nonnegative
        CHECK (
            control_epoch >= 0
        ),

    CONSTRAINT human_control_lease_expiry_check
        CHECK (
            expires_at > COALESCE(acquired_at, created_at)
        ),

    CONSTRAINT human_control_lease_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT human_control_lease_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    UNIQUE (
        organization_id,
        environment_id,
        id
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_human_control_lease_one_active
ON human_operations.control_leases (
    organization_id,
    environment_id,
    incident_id
)
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_human_control_lease_holder
ON human_operations.control_leases (
    organization_id,
    environment_id,
    holder_user_id,
    status,
    expires_at
);

-- ============================================================================
-- 7. HUMAN TASK STATUS HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_operations.task_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    task_id UUID NOT NULL,

    from_status TEXT,

    to_status TEXT NOT NULL,

    actor_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    reason TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT human_task_history_task_fk
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
        ON DELETE CASCADE,

    CONSTRAINT human_task_history_status_check
        CHECK (
            to_status IN (
                'OPEN',
                'ASSIGNED',
                'ACKNOWLEDGED',
                'IN_PROGRESS',
                'WAITING',
                'RESOLVED',
                'CANCELLED',
                'EXPIRED'
            )
        ),

    CONSTRAINT human_task_history_from_status_check
        CHECK (
            from_status IS NULL
            OR from_status IN (
                'OPEN',
                'ASSIGNED',
                'ACKNOWLEDGED',
                'IN_PROGRESS',
                'WAITING',
                'RESOLVED',
                'CANCELLED',
                'EXPIRED'
            )
        ),

    CONSTRAINT human_task_history_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT human_task_history_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    UNIQUE (
        organization_id,
        environment_id,
        id
    )
);

CREATE INDEX IF NOT EXISTS idx_human_task_history_task
ON human_operations.task_status_history (
    organization_id,
    environment_id,
    task_id,
    created_at DESC
);

-- ============================================================================
-- 8. TAKEOVER EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS human_operations.takeover_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL UNIQUE,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    incident_id TEXT NOT NULL,

    takeover_session_id UUID,

    control_lease_id UUID,

    event_type TEXT NOT NULL,

    actor_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    control_epoch BIGINT NOT NULL DEFAULT 0,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    execution_authorized BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT human_takeover_event_session_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            takeover_session_id
        )
        REFERENCES human_operations.takeover_sessions (
            organization_id,
            environment_id,
            id
        )
        ON DELETE SET NULL,

    CONSTRAINT human_takeover_event_lease_fk
        FOREIGN KEY (
            organization_id,
            environment_id,
            control_lease_id
        )
        REFERENCES human_operations.control_leases (
            organization_id,
            environment_id,
            id
        )
        ON DELETE SET NULL,

    CONSTRAINT human_takeover_event_epoch_nonnegative
        CHECK (
            control_epoch >= 0
        ),

    CONSTRAINT human_takeover_event_metadata_object
        CHECK (
            jsonb_typeof(metadata) = 'object'
        ),

    CONSTRAINT human_takeover_event_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    UNIQUE (
        organization_id,
        environment_id,
        id
    )
);

CREATE INDEX IF NOT EXISTS idx_human_takeover_events_incident
ON human_operations.takeover_events (
    organization_id,
    environment_id,
    incident_id,
    created_at DESC
);

-- ============================================================================
-- 9. ORGANIZATION / ENVIRONMENT SCOPE VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION
human_operations.aira_validate_scoped_human_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actual_organization_id UUID;
BEGIN
    SELECT organization_id
    INTO actual_organization_id
    FROM tenancy.environments
    WHERE id = NEW.environment_id;

    IF actual_organization_id IS NULL THEN
        RAISE EXCEPTION
            'human operations environment does not exist';
    END IF;

    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'human operations organization/environment mismatch';
    END IF;

    IF NEW.execution_authorized = TRUE THEN
        RAISE EXCEPTION
            'human takeover state cannot authorize AIRA execution';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'assignments',
        'acknowledgements',
        'resolutions',
        'takeover_sessions',
        'control_leases',
        'task_status_history',
        'takeover_events'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%I_scope
             ON human_operations.%I',
            table_name,
            table_name
        );

        EXECUTE format(
            'CREATE TRIGGER trg_%I_scope
             BEFORE INSERT OR UPDATE
             ON human_operations.%I
             FOR EACH ROW
             EXECUTE FUNCTION
             human_operations.aira_validate_scoped_human_row()',
            table_name,
            table_name
        );
    END LOOP;
END;
$$;

-- ============================================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================================

DO $$
DECLARE
    table_name TEXT;
    policy_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'tasks',
        'assignments',
        'acknowledgements',
        'resolutions',
        'takeover_sessions',
        'control_leases',
        'task_status_history',
        'takeover_events'
    ]
    LOOP

        EXECUTE format(
            'ALTER TABLE human_operations.%I
             ENABLE ROW LEVEL SECURITY',
            table_name
        );

        EXECUTE format(
            'ALTER TABLE human_operations.%I
             FORCE ROW LEVEL SECURITY',
            table_name
        );

        policy_name :=
            'human_operations_'
            || table_name
            || '_tenant_environment_policy';

        EXECUTE format(
            'DROP POLICY IF EXISTS %I
             ON human_operations.%I',
            policy_name,
            table_name
        );

        EXECUTE format(
            'CREATE POLICY %I
             ON human_operations.%I
             FOR ALL
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
             )',
            policy_name,
            table_name
        );

    END LOOP;
END;
$$;

-- ============================================================================
-- 11. RETAIN THE EXISTING HUMAN TASK EXECUTION SAFETY RULE
-- ============================================================================

ALTER TABLE human_operations.tasks
    DROP CONSTRAINT IF EXISTS
        human_task_never_authorizes_execution;

ALTER TABLE human_operations.tasks
    ADD CONSTRAINT
        human_task_never_authorizes_execution
    CHECK (
        execution_authorized = FALSE
    );

-- ============================================================================
-- END PHASE 23.0 + 23.1 DOMAIN FOUNDATION
-- ============================================================================