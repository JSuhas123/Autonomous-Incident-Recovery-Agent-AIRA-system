-- ============================================================================
-- AIRA PHASE 14.11
-- HUMAN OPERATIONS / HUMAN TASKS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS human_operations;


CREATE TABLE IF NOT EXISTS human_operations.tasks (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    incident_id TEXT,

    approval_id TEXT,

    escalation_id TEXT,

    execution_request_id TEXT,

    recovery_decision_id TEXT,

    task_type TEXT NOT NULL,

    title TEXT NOT NULL,

    description TEXT,

    priority TEXT NOT NULL
        DEFAULT 'MEDIUM',

    status TEXT NOT NULL
        DEFAULT 'OPEN',

    source TEXT NOT NULL
        DEFAULT 'AIRA',

    assigned_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    assigned_team_id UUID,

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    acknowledged_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    resolved_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    cancelled_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    acknowledgement_required BOOLEAN NOT NULL
        DEFAULT TRUE,

    autonomous_recovery_blocked BOOLEAN NOT NULL
        DEFAULT TRUE,

    execution_authorized BOOLEAN NOT NULL
        DEFAULT FALSE,

    recommended_actions JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    evidence JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    resolution JSONB,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    due_at TIMESTAMPTZ,

    acknowledged_at TIMESTAMPTZ,

    resolved_at TIMESTAMPTZ,

    cancelled_at TIMESTAMPTZ,

    escalated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT human_task_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT human_task_priority_check
        CHECK (
            priority IN (
                'CRITICAL',
                'HIGH',
                'MEDIUM',
                'LOW'
            )
        ),

    CONSTRAINT human_task_status_check
        CHECK (
            status IN (
                'OPEN',
                'ASSIGNED',
                'ACKNOWLEDGED',
                'IN_PROGRESS',
                'RESOLVED',
                'CANCELLED',
                'ESCALATED'
            )
        ),

    CONSTRAINT human_task_type_check
        CHECK (
            task_type IN (
                'INCIDENT_REVIEW',
                'APPROVAL_REQUIRED',
                'RECOVERY_FAILED',
                'ROLLBACK_REQUIRED',
                'POLICY_REVIEW',
                'VERIFICATION_REVIEW',
                'MANUAL_INTERVENTION',
                'GENERAL'
            )
        ),

    CONSTRAINT human_task_title_nonempty
        CHECK (
            length(trim(title)) > 0
        ),

    CONSTRAINT human_task_never_authorizes_execution
        CHECK (
            execution_authorized = FALSE
        ),

    CONSTRAINT human_task_recommended_actions_array
        CHECK (
            jsonb_typeof(recommended_actions) = 'array'
        ),

    CONSTRAINT human_task_evidence_array
        CHECK (
            jsonb_typeof(evidence) = 'array'
        )
);


CREATE INDEX IF NOT EXISTS
    idx_human_tasks_queue
ON human_operations.tasks (
    organization_id,
    environment_id,
    status,
    priority,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_human_tasks_incident
ON human_operations.tasks (
    organization_id,
    environment_id,
    incident_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_human_tasks_assignee
ON human_operations.tasks (
    organization_id,
    assigned_user_id,
    status
);


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_human_tasks_escalation_unique
ON human_operations.tasks (
    organization_id,
    environment_id,
    escalation_id
)
WHERE escalation_id IS NOT NULL;


-- ============================================================================
-- SCOPE SAFETY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    human_operations.aira_validate_human_task_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    actual_organization_id UUID;
BEGIN
    SELECT
        organization_id
    INTO
        actual_organization_id
    FROM
        tenancy.environments
    WHERE
        id = NEW.environment_id;

    IF actual_organization_id IS NULL THEN
        RAISE EXCEPTION
            'human task environment does not exist';
    END IF;

    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'human task organization/environment mismatch';
    END IF;

    IF NEW.execution_authorized = TRUE THEN
        RAISE EXCEPTION
            'human tasks cannot authorize execution';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_human_task_scope
ON human_operations.tasks;


CREATE TRIGGER
    trg_human_task_scope
BEFORE INSERT OR UPDATE
ON human_operations.tasks
FOR EACH ROW
EXECUTE FUNCTION
    human_operations.aira_validate_human_task_scope();


DROP TRIGGER IF EXISTS
    trg_human_tasks_updated_at
ON human_operations.tasks;


CREATE TRIGGER
    trg_human_tasks_updated_at
BEFORE UPDATE
ON human_operations.tasks
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();