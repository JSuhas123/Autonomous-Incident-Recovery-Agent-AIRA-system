BEGIN;


-- ============================================================================
-- AIRA PHASE 18.7
-- MIGRATION 0073 — PLAYBOOK + RUNBOOK EXECUTION HISTORY FOUNDATION
-- ============================================================================
--
-- PostgreSQL becomes canonical for:
--
--   PlaybookExecution
--   RunbookExecution
--
-- This migration deliberately stores forensic execution detail as JSONB where
-- the internal structure is expected to evolve, while keeping execution
-- identity, ownership, lifecycle and exact knowledge-version identity as
-- strongly typed columns.
--
-- Invariants:
--
--   1. execution identity is immutable
--   2. execution ownership is immutable
--   3. exact Playbook/Runbook identity is immutable
--   4. exact executed snapshot is immutable
--   5. checksum is immutable
--   6. execution records remain tenant/environment isolated
--   7. PostgreSQL is canonical
--   8. execution history does not itself authorize future execution
--   9. policy/approval/verification/rollback remain separate evidence
--  10. historical executions are retained for Phase 18 effectiveness analysis
--
-- Mongo's old 90-day TTL is intentionally NOT reproduced here.
-- Phase 18 historical-effectiveness requires durable history.
-- Future retention/archival policy must be explicit rather than destructive.
-- ============================================================================


-- ============================================================================
-- PLAYBOOK EXECUTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.playbook_executions (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    legacy_mongo_id TEXT,

    execution_id TEXT NOT NULL,

    correlation_id TEXT NOT NULL,

    tenant_public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE RESTRICT,

    incident_id UUID
        REFERENCES incidents.incidents(id)
        ON DELETE SET NULL,

    incident_public_id TEXT,

    -- ------------------------------------------------------------------------
    -- Exact Playbook identity
    -- ------------------------------------------------------------------------

    playbook_id TEXT NOT NULL,

    playbook_version TEXT NOT NULL,

    playbook_version_id UUID
        REFERENCES knowledge.playbook_versions(id)
        ON DELETE RESTRICT,

    version_ref TEXT NOT NULL,

    playbook_checksum TEXT NOT NULL,

    /*
     * Exact immutable snapshot used for this execution.
     *
     * Administrative lifecycle transitions to the knowledge version after this
     * execution must never rewrite this value.
     */
    playbook_snapshot JSONB NOT NULL,

    -- ------------------------------------------------------------------------
    -- Incident + matching context
    -- ------------------------------------------------------------------------

    incident_context JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    resolved_mappings JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    match_score NUMERIC,

    match_reasons JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    -- ------------------------------------------------------------------------
    -- Policy / approval
    -- ------------------------------------------------------------------------

    policy_decision JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    approval JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    -- ------------------------------------------------------------------------
    -- Execution lifecycle
    -- ------------------------------------------------------------------------

    status TEXT NOT NULL
        DEFAULT 'CREATED',

    status_reason TEXT,

    started_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,

    duration_ms BIGINT,

    initiated_by TEXT,

    initiator_type TEXT NOT NULL
        DEFAULT 'api',

    -- ------------------------------------------------------------------------
    -- Execution trace
    -- ------------------------------------------------------------------------

    stage_executions JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    rollback JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    escalation JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    outcome JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    -- ------------------------------------------------------------------------
    -- Failure
    -- ------------------------------------------------------------------------

    failed_stage_id TEXT,

    error_message TEXT,

    error_code TEXT,

    -- ------------------------------------------------------------------------
    -- Audit
    -- ------------------------------------------------------------------------

    audit_event_ids JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    decision_trace_id TEXT,

    requires_human_review BOOLEAN NOT NULL
        DEFAULT FALSE,

    /*
     * This means ONLY:
     *
     * "this stored execution record does not grant execution permission".
     *
     * An historical successful execution must never become authorization for a
     * future execution.
     */
    execution_authorized BOOLEAN NOT NULL
        DEFAULT FALSE,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT playbook_executions_public_id_unique
        UNIQUE (
            public_id
        ),

    CONSTRAINT playbook_executions_execution_id_unique
        UNIQUE (
            execution_id
        ),

    CONSTRAINT playbook_executions_legacy_mongo_id_unique
        UNIQUE (
            legacy_mongo_id
        ),

    CONSTRAINT playbook_executions_status_check
        CHECK (
            status IN (
                'CREATED',
                'EVALUATING',
                'WAITING_FOR_APPROVAL',
                'RUNNING',
                'VERIFYING',
                'SUCCEEDED',
                'FAILED',
                'ROLLBACK_PENDING',
                'ROLLING_BACK',
                'ROLLED_BACK',
                'ROLLBACK_FAILED',
                'ESCALATED',
                'CANCELLED'
            )
        ),

    CONSTRAINT playbook_executions_initiator_type_check
        CHECK (
            initiator_type IN (
                'user',
                'agent',
                'system',
                'api'
            )
        ),

    CONSTRAINT playbook_executions_duration_check
        CHECK (
            duration_ms IS NULL
            OR duration_ms >= 0
        ),

    CONSTRAINT playbook_executions_match_score_check
        CHECK (
            match_score IS NULL
            OR (
                match_score >= 0
                AND match_score <= 1
            )
        ),

    CONSTRAINT playbook_executions_never_authorize
        CHECK (
            execution_authorized = FALSE
        )
);


-- ============================================================================
-- RUNBOOK EXECUTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS execution.runbook_executions (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    legacy_mongo_id TEXT,

    execution_id TEXT NOT NULL,

    correlation_id TEXT NOT NULL,

    tenant_public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE RESTRICT,

    environment_id UUID NOT NULL
        REFERENCES tenancy.environments(id)
        ON DELETE RESTRICT,

    incident_id UUID
        REFERENCES incidents.incidents(id)
        ON DELETE SET NULL,

    incident_public_id TEXT,

    /*
     * Optional parent Playbook execution.
     *
     * A Runbook can also be executed independently, so this remains nullable.
     */
    playbook_execution_id UUID
        REFERENCES execution.playbook_executions(id)
        ON DELETE SET NULL,

    playbook_execution_public_id TEXT,

    -- ------------------------------------------------------------------------
    -- Exact Runbook identity
    -- ------------------------------------------------------------------------

    runbook_id TEXT NOT NULL,

    runbook_version TEXT NOT NULL,

    runbook_version_id UUID
        REFERENCES knowledge.runbook_versions(id)
        ON DELETE RESTRICT,

    version_ref TEXT NOT NULL,

    runbook_checksum TEXT NOT NULL,

    runbook_snapshot JSONB NOT NULL,

    -- ------------------------------------------------------------------------
    -- Parameters / policy / approval
    -- ------------------------------------------------------------------------

    resolved_parameters JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    policy_decision JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    approval_id TEXT,

    approver TEXT,

    approved_at TIMESTAMPTZ,

    -- ------------------------------------------------------------------------
    -- Lifecycle
    -- ------------------------------------------------------------------------

    status TEXT NOT NULL
        DEFAULT 'CREATED',

    status_reason TEXT,

    started_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,

    duration_ms BIGINT,

    initiated_by TEXT,

    initiator_type TEXT NOT NULL
        DEFAULT 'api',

    -- ------------------------------------------------------------------------
    -- Step forensic trace
    -- ------------------------------------------------------------------------

    step_attempts JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    -- ------------------------------------------------------------------------
    -- Verification
    -- ------------------------------------------------------------------------

    verification_result JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    -- ------------------------------------------------------------------------
    -- Rollback
    -- ------------------------------------------------------------------------

    rollback_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    -- ------------------------------------------------------------------------
    -- State capture
    -- ------------------------------------------------------------------------

    pre_execution_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    post_execution_state JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    -- ------------------------------------------------------------------------
    -- Audit
    -- ------------------------------------------------------------------------

    audit_event_ids JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    decision_trace_id TEXT,

    -- ------------------------------------------------------------------------
    -- Failure
    -- ------------------------------------------------------------------------

    failed_step_id TEXT,

    error_message TEXT,

    error_code TEXT,

    -- ------------------------------------------------------------------------
    -- Safety / escalation
    -- ------------------------------------------------------------------------

    requires_human_review BOOLEAN NOT NULL
        DEFAULT FALSE,

    escalated BOOLEAN NOT NULL
        DEFAULT FALSE,

    escalated_at TIMESTAMPTZ,

    escalation_reason TEXT,

    execution_authorized BOOLEAN NOT NULL
        DEFAULT FALSE,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT runbook_executions_public_id_unique
        UNIQUE (
            public_id
        ),

    CONSTRAINT runbook_executions_execution_id_unique
        UNIQUE (
            execution_id
        ),

    CONSTRAINT runbook_executions_legacy_mongo_id_unique
        UNIQUE (
            legacy_mongo_id
        ),

    CONSTRAINT runbook_executions_status_check
        CHECK (
            status IN (
                'CREATED',
                'VALIDATING',
                'WAITING_FOR_APPROVAL',
                'RUNNING',
                'VERIFYING',
                'SUCCEEDED',
                'FAILED',
                'ROLLBACK_PENDING',
                'ROLLING_BACK',
                'ROLLED_BACK',
                'ROLLBACK_FAILED',
                'ESCALATED',
                'CANCELLED'
            )
        ),

    CONSTRAINT runbook_executions_initiator_type_check
        CHECK (
            initiator_type IN (
                'user',
                'agent',
                'system',
                'api'
            )
        ),

    CONSTRAINT runbook_executions_duration_check
        CHECK (
            duration_ms IS NULL
            OR duration_ms >= 0
        ),

    CONSTRAINT runbook_executions_never_authorize
        CHECK (
            execution_authorized = FALSE
        )
);


-- ============================================================================
-- ENVIRONMENT / INCIDENT / STATUS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS
    idx_playbook_executions_scope_created
ON execution.playbook_executions (
    organization_id,
    environment_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_playbook_executions_scope_playbook_status
ON execution.playbook_executions (
    organization_id,
    environment_id,
    playbook_id,
    status
);


CREATE INDEX IF NOT EXISTS
    idx_playbook_executions_scope_incident_created
ON execution.playbook_executions (
    organization_id,
    environment_id,
    incident_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_playbook_executions_scope_correlation
ON execution.playbook_executions (
    organization_id,
    environment_id,
    correlation_id
);


CREATE INDEX IF NOT EXISTS
    idx_playbook_executions_scope_status_created
ON execution.playbook_executions (
    organization_id,
    environment_id,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_playbook_executions_tenant_public
ON execution.playbook_executions (
    tenant_public_id,
    environment_id,
    playbook_id,
    status
);


CREATE INDEX IF NOT EXISTS
    idx_playbook_executions_version
ON execution.playbook_executions (
    playbook_version_id
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_scope_created
ON execution.runbook_executions (
    organization_id,
    environment_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_scope_runbook_status
ON execution.runbook_executions (
    organization_id,
    environment_id,
    runbook_id,
    status
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_scope_incident_created
ON execution.runbook_executions (
    organization_id,
    environment_id,
    incident_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_scope_correlation
ON execution.runbook_executions (
    organization_id,
    environment_id,
    correlation_id
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_scope_status_created
ON execution.runbook_executions (
    organization_id,
    environment_id,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_tenant_public
ON execution.runbook_executions (
    tenant_public_id,
    environment_id,
    runbook_id,
    status
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_version
ON execution.runbook_executions (
    runbook_version_id
);


CREATE INDEX IF NOT EXISTS
    idx_runbook_executions_parent_playbook
ON execution.runbook_executions (
    playbook_execution_id
);


-- ============================================================================
-- OWNERSHIP CONSISTENCY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    execution.validate_playbook_execution_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    environment_org UUID;

    incident_org UUID;

    incident_env UUID;

    version_org UUID;

    version_env UUID;
BEGIN

    SELECT organization_id
    INTO environment_org
    FROM tenancy.environments
    WHERE id =
        NEW.environment_id;


    IF environment_org IS NULL THEN
        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_ENVIRONMENT_NOT_FOUND';
    END IF;


    IF environment_org <>
       NEW.organization_id THEN
        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_ENVIRONMENT_ORGANIZATION_MISMATCH';
    END IF;


    IF NEW.incident_id IS NOT NULL THEN

        SELECT
            organization_id,
            environment_id
        INTO
            incident_org,
            incident_env
        FROM incidents.incidents
        WHERE id =
            NEW.incident_id;


        IF incident_org IS NULL THEN
            RAISE EXCEPTION
                'PLAYBOOK_EXECUTION_INCIDENT_NOT_FOUND';
        END IF;


        IF incident_org <>
           NEW.organization_id THEN
            RAISE EXCEPTION
                'PLAYBOOK_EXECUTION_INCIDENT_ORGANIZATION_MISMATCH';
        END IF;


        IF incident_env <>
           NEW.environment_id THEN
            RAISE EXCEPTION
                'PLAYBOOK_EXECUTION_INCIDENT_ENVIRONMENT_MISMATCH';
        END IF;

    END IF;


    IF NEW.playbook_version_id IS NOT NULL THEN

        SELECT
            organization_id,
            environment_id
        INTO
            version_org,
            version_env
        FROM knowledge.playbook_versions
        WHERE id =
            NEW.playbook_version_id;


        IF NOT FOUND THEN
            RAISE EXCEPTION
                'PLAYBOOK_EXECUTION_PLAYBOOK_VERSION_NOT_FOUND';
        END IF;


        /*
         * GLOBAL versions deliberately have NULL org/env and are allowed.
         *
         * Tenant-scoped knowledge must exactly match execution ownership.
         */
        IF version_org IS NOT NULL
           AND version_org <>
               NEW.organization_id THEN
            RAISE EXCEPTION
                'PLAYBOOK_EXECUTION_PLAYBOOK_ORGANIZATION_MISMATCH';
        END IF;


        IF version_env IS NOT NULL
           AND version_env <>
               NEW.environment_id THEN
            RAISE EXCEPTION
                'PLAYBOOK_EXECUTION_PLAYBOOK_ENVIRONMENT_MISMATCH';
        END IF;

    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_validate_playbook_execution_scope
ON execution.playbook_executions;


CREATE TRIGGER
    trg_validate_playbook_execution_scope
BEFORE INSERT OR UPDATE
ON execution.playbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.validate_playbook_execution_scope();


CREATE OR REPLACE FUNCTION
    execution.validate_runbook_execution_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    environment_org UUID;

    incident_org UUID;

    incident_env UUID;

    version_org UUID;

    version_env UUID;

    parent_org UUID;

    parent_env UUID;
BEGIN

    SELECT organization_id
    INTO environment_org
    FROM tenancy.environments
    WHERE id =
        NEW.environment_id;


    IF environment_org IS NULL THEN
        RAISE EXCEPTION
            'RUNBOOK_EXECUTION_ENVIRONMENT_NOT_FOUND';
    END IF;


    IF environment_org <>
       NEW.organization_id THEN
        RAISE EXCEPTION
            'RUNBOOK_EXECUTION_ENVIRONMENT_ORGANIZATION_MISMATCH';
    END IF;


    IF NEW.incident_id IS NOT NULL THEN

        SELECT
            organization_id,
            environment_id
        INTO
            incident_org,
            incident_env
        FROM incidents.incidents
        WHERE id =
            NEW.incident_id;


        IF incident_org IS NULL THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_INCIDENT_NOT_FOUND';
        END IF;


        IF incident_org <>
           NEW.organization_id THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_INCIDENT_ORGANIZATION_MISMATCH';
        END IF;


        IF incident_env <>
           NEW.environment_id THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_INCIDENT_ENVIRONMENT_MISMATCH';
        END IF;

    END IF;


    IF NEW.runbook_version_id IS NOT NULL THEN

        SELECT
            organization_id,
            environment_id
        INTO
            version_org,
            version_env
        FROM knowledge.runbook_versions
        WHERE id =
            NEW.runbook_version_id;


        IF NOT FOUND THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_RUNBOOK_VERSION_NOT_FOUND';
        END IF;


        IF version_org IS NOT NULL
           AND version_org <>
               NEW.organization_id THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_RUNBOOK_ORGANIZATION_MISMATCH';
        END IF;


        IF version_env IS NOT NULL
           AND version_env <>
               NEW.environment_id THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_RUNBOOK_ENVIRONMENT_MISMATCH';
        END IF;

    END IF;


    IF NEW.playbook_execution_id IS NOT NULL THEN

        SELECT
            organization_id,
            environment_id
        INTO
            parent_org,
            parent_env
        FROM execution.playbook_executions
        WHERE id =
            NEW.playbook_execution_id;


        IF parent_org IS NULL THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_PARENT_PLAYBOOK_NOT_FOUND';
        END IF;


        IF parent_org <>
           NEW.organization_id THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_PARENT_ORGANIZATION_MISMATCH';
        END IF;


        IF parent_env <>
           NEW.environment_id THEN
            RAISE EXCEPTION
                'RUNBOOK_EXECUTION_PARENT_ENVIRONMENT_MISMATCH';
        END IF;

    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_validate_runbook_execution_scope
ON execution.runbook_executions;


CREATE TRIGGER
    trg_validate_runbook_execution_scope
BEFORE INSERT OR UPDATE
ON execution.runbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.validate_runbook_execution_scope();


-- ============================================================================
-- EXECUTED KNOWLEDGE IDENTITY + SNAPSHOT IMMUTABILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    execution.protect_playbook_execution_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF OLD.execution_id IS DISTINCT FROM
       NEW.execution_id

       OR OLD.organization_id IS DISTINCT FROM
          NEW.organization_id

       OR OLD.environment_id IS DISTINCT FROM
          NEW.environment_id

       OR OLD.tenant_public_id IS DISTINCT FROM
          NEW.tenant_public_id

       OR OLD.playbook_id IS DISTINCT FROM
          NEW.playbook_id

       OR OLD.playbook_version IS DISTINCT FROM
          NEW.playbook_version

       OR OLD.playbook_version_id IS DISTINCT FROM
          NEW.playbook_version_id

       OR OLD.version_ref IS DISTINCT FROM
          NEW.version_ref

       OR OLD.playbook_checksum IS DISTINCT FROM
          NEW.playbook_checksum

       OR OLD.playbook_snapshot IS DISTINCT FROM
          NEW.playbook_snapshot

    THEN
        RAISE EXCEPTION
            'PLAYBOOK_EXECUTION_IMMUTABLE_IDENTITY_VIOLATION';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_playbook_execution_identity
ON execution.playbook_executions;


CREATE TRIGGER
    trg_protect_playbook_execution_identity
BEFORE UPDATE
ON execution.playbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.protect_playbook_execution_identity();


CREATE OR REPLACE FUNCTION
    execution.protect_runbook_execution_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF OLD.execution_id IS DISTINCT FROM
       NEW.execution_id

       OR OLD.organization_id IS DISTINCT FROM
          NEW.organization_id

       OR OLD.environment_id IS DISTINCT FROM
          NEW.environment_id

       OR OLD.tenant_public_id IS DISTINCT FROM
          NEW.tenant_public_id

       OR OLD.runbook_id IS DISTINCT FROM
          NEW.runbook_id

       OR OLD.runbook_version IS DISTINCT FROM
          NEW.runbook_version

       OR OLD.runbook_version_id IS DISTINCT FROM
          NEW.runbook_version_id

       OR OLD.version_ref IS DISTINCT FROM
          NEW.version_ref

       OR OLD.runbook_checksum IS DISTINCT FROM
          NEW.runbook_checksum

       OR OLD.runbook_snapshot IS DISTINCT FROM
          NEW.runbook_snapshot

    THEN
        RAISE EXCEPTION
            'RUNBOOK_EXECUTION_IMMUTABLE_IDENTITY_VIOLATION';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_protect_runbook_execution_identity
ON execution.runbook_executions;


CREATE TRIGGER
    trg_protect_runbook_execution_identity
BEFORE UPDATE
ON execution.runbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.protect_runbook_execution_identity();


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION
    execution.touch_execution_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at =
        NOW();

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_touch_playbook_execution_updated_at
ON execution.playbook_executions;


CREATE TRIGGER
    trg_touch_playbook_execution_updated_at
BEFORE UPDATE
ON execution.playbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.touch_execution_updated_at();


DROP TRIGGER IF EXISTS
    trg_touch_runbook_execution_updated_at
ON execution.runbook_executions;


CREATE TRIGGER
    trg_touch_runbook_execution_updated_at
BEFORE UPDATE
ON execution.runbook_executions
FOR EACH ROW
EXECUTE FUNCTION
    execution.touch_execution_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE
    execution.playbook_executions
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    execution.runbook_executions
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    playbook_executions_tenant_scope
ON execution.playbook_executions;


CREATE POLICY
    playbook_executions_tenant_scope
ON execution.playbook_executions
USING (
    organization_id =
        NULLIF(
            current_setting(
                'aira.organization_id',
                TRUE
            ),
            ''
        )::UUID

    AND

    environment_id =
        NULLIF(
            current_setting(
                'aira.environment_id',
                TRUE
            ),
            ''
        )::UUID
)
WITH CHECK (
    organization_id =
        NULLIF(
            current_setting(
                'aira.organization_id',
                TRUE
            ),
            ''
        )::UUID

    AND

    environment_id =
        NULLIF(
            current_setting(
                'aira.environment_id',
                TRUE
            ),
            ''
        )::UUID
);


DROP POLICY IF EXISTS
    runbook_executions_tenant_scope
ON execution.runbook_executions;


CREATE POLICY
    runbook_executions_tenant_scope
ON execution.runbook_executions
USING (
    organization_id =
        NULLIF(
            current_setting(
                'aira.organization_id',
                TRUE
            ),
            ''
        )::UUID

    AND

    environment_id =
        NULLIF(
            current_setting(
                'aira.environment_id',
                TRUE
            ),
            ''
        )::UUID
)
WITH CHECK (
    organization_id =
        NULLIF(
            current_setting(
                'aira.organization_id',
                TRUE
            ),
            ''
        )::UUID

    AND

    environment_id =
        NULLIF(
            current_setting(
                'aira.environment_id',
                TRUE
            ),
            ''
        )::UUID
);


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE
    execution.playbook_executions
IS
    'Phase 18 canonical forensic Playbook execution history. PostgreSQL authoritative.';


COMMENT ON TABLE
    execution.runbook_executions
IS
    'Phase 18 canonical forensic Runbook execution history. PostgreSQL authoritative.';


COMMENT ON COLUMN
    execution.playbook_executions.execution_authorized
IS
    'Always false. Historical execution data is evidence and never grants future execution authorization.';


COMMENT ON COLUMN
    execution.runbook_executions.execution_authorized
IS
    'Always false. Historical execution data is evidence and never grants future execution authorization.';


COMMIT;