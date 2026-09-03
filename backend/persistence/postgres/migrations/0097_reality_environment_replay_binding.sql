-- ============================================================================
-- AIRA PHASE 23R.10C
-- REALITY REPLAY <-> ENVIRONMENT REPLAY <-> PHASE-21 EXPERIMENT BINDING
-- ============================================================================
--
-- This table persists identity relationships only.
--
-- It does NOT replace Phase-21 experiment state.
-- It does NOT grant execution authority.
-- It does NOT contain evaluator ground truth.
-- It does NOT convert lab evidence into production proof.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS
    reality.environment_replay_runs (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'envreplay_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        replay_run_id UUID NOT NULL
            REFERENCES reality.replay_runs(id)
            ON DELETE RESTRICT,

        replay_run_public_id TEXT NOT NULL,

        case_public_id TEXT NOT NULL,

        case_revision INTEGER NOT NULL,

        case_content_hash TEXT NOT NULL,

        lab_environment_id UUID NOT NULL
            REFERENCES reliability.lab_environments(id)
            ON DELETE RESTRICT,

        lab_environment_public_id TEXT NOT NULL,

        experiment_run_id UUID
            REFERENCES reliability.experiment_runs(id)
            ON DELETE RESTRICT,

        experiment_run_public_id TEXT,

        correlation_id TEXT NOT NULL,

        mode TEXT NOT NULL,

        stage TEXT NOT NULL
            DEFAULT 'CREATED',

        failure_code TEXT,

        failure_message TEXT,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        started_at TIMESTAMPTZ,

        completed_at TIMESTAMPTZ,

        failed_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        CONSTRAINT reality_environment_replay_mode_check
            CHECK (
                mode IN (
                    'DOCKER',
                    'KUBERNETES'
                )
            ),

        CONSTRAINT reality_environment_replay_stage_check
            CHECK (
                stage IN (
                    'CREATED',
                    'LAB_RESERVED',
                    'EXPERIMENT_BOUND',
                    'INJECTING',
                    'OBSERVING',
                    'INVESTIGATING',
                    'RECOVERY_PENDING',
                    'RECOVERING',
                    'VERIFYING',
                    'RESETTING',
                    'COMPLETED',
                    'FAILED'
                )
            ),

        CONSTRAINT reality_environment_replay_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT reality_environment_replay_never_authorizes
            CHECK (
                execution_authorized = FALSE
            ),

        CONSTRAINT reality_environment_replay_experiment_pair
            CHECK (
                (
                    experiment_run_id IS NULL
                    AND
                    experiment_run_public_id IS NULL
                )
                OR
                (
                    experiment_run_id IS NOT NULL
                    AND
                    experiment_run_public_id IS NOT NULL
                )
            ),

        UNIQUE (
            organization_id,
            environment_id,
            replay_run_id,
            lab_environment_id
        )
    );

CREATE INDEX IF NOT EXISTS
    idx_reality_environment_replay_scope_time
ON reality.environment_replay_runs (
    organization_id,
    environment_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS
    idx_reality_environment_replay_replay_run
ON reality.environment_replay_runs (
    replay_run_id
);

CREATE INDEX IF NOT EXISTS
    idx_reality_environment_replay_experiment_run
ON reality.environment_replay_runs (
    experiment_run_id
)
WHERE
    experiment_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS
    idx_reality_environment_replay_correlation
ON reality.environment_replay_runs (
    correlation_id
);

-- ============================================================================
-- CROSS-DOMAIN BINDING SAFETY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    reality.aira_validate_environment_replay_binding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_replay reality.replay_runs%ROWTYPE;
    v_lab reliability.lab_environments%ROWTYPE;
    v_experiment reliability.experiment_runs%ROWTYPE;
BEGIN
    SELECT *
    INTO v_replay
    FROM reality.replay_runs
    WHERE id = NEW.replay_run_id
    FOR SHARE;

    IF v_replay.id IS NULL THEN
        RAISE EXCEPTION
            'Reality replay run does not exist';
    END IF;

    IF
        v_replay.organization_id IS DISTINCT FROM NEW.organization_id
        OR
        v_replay.environment_id IS DISTINCT FROM NEW.environment_id
        OR
        v_replay.public_id IS DISTINCT FROM NEW.replay_run_public_id
        OR
        v_replay.case_public_id IS DISTINCT FROM NEW.case_public_id
        OR
        v_replay.case_revision IS DISTINCT FROM NEW.case_revision
        OR
        v_replay.case_content_hash IS DISTINCT FROM NEW.case_content_hash
        OR
        v_replay.execution_authorized IS DISTINCT FROM FALSE
    THEN
        RAISE EXCEPTION
            'Reality replay binding identity mismatch';
    END IF;

    SELECT *
    INTO v_lab
    FROM reliability.lab_environments
    WHERE id = NEW.lab_environment_id
    FOR SHARE;

    IF v_lab.id IS NULL THEN
        RAISE EXCEPTION
            'Reliability Lab environment does not exist';
    END IF;

    IF
        v_lab.organization_id IS DISTINCT FROM NEW.organization_id
        OR
        v_lab.environment_id IS DISTINCT FROM NEW.environment_id
        OR
        v_lab.public_id IS DISTINCT FROM NEW.lab_environment_public_id
        OR
        v_lab.safety_class IS DISTINCT FROM 'LAB_ONLY'
        OR
        v_lab.production IS DISTINCT FROM FALSE
        OR
        v_lab.execution_authorized IS DISTINCT FROM FALSE
    THEN
        RAISE EXCEPTION
            'Reality environment replay requires matching LAB_ONLY environment';
    END IF;

    IF NEW.experiment_run_id IS NOT NULL THEN
        SELECT *
        INTO v_experiment
        FROM reliability.experiment_runs
        WHERE id = NEW.experiment_run_id
        FOR SHARE;

        IF v_experiment.id IS NULL THEN
            RAISE EXCEPTION
                'Phase 21 experiment run does not exist';
        END IF;

        IF
            v_experiment.organization_id IS DISTINCT FROM NEW.organization_id
            OR
            v_experiment.environment_id IS DISTINCT FROM NEW.environment_id
            OR
            v_experiment.lab_environment_id IS DISTINCT FROM NEW.lab_environment_id
            OR
            v_experiment.public_id IS DISTINCT FROM NEW.experiment_run_public_id
            OR
            v_experiment.correlation_id IS DISTINCT FROM NEW.correlation_id
            OR
            v_experiment.execution_authorized IS DISTINCT FROM FALSE
        THEN
            RAISE EXCEPTION
                'Phase 21 experiment binding identity mismatch';
        END IF;
    END IF;

    IF NEW.execution_authorized IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION
            'Reality environment replay may not grant execution authority';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
    trg_reality_environment_replay_binding
ON reality.environment_replay_runs;

CREATE TRIGGER
    trg_reality_environment_replay_binding
BEFORE INSERT OR UPDATE
ON reality.environment_replay_runs
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_validate_environment_replay_binding();

-- ============================================================================
-- IDENTITY IMMUTABILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION
    reality.aira_guard_environment_replay_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF
        NEW.id IS DISTINCT FROM OLD.id
        OR
        NEW.public_id IS DISTINCT FROM OLD.public_id
        OR
        NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR
        NEW.environment_id IS DISTINCT FROM OLD.environment_id
        OR
        NEW.replay_run_id IS DISTINCT FROM OLD.replay_run_id
        OR
        NEW.replay_run_public_id IS DISTINCT FROM OLD.replay_run_public_id
        OR
        NEW.case_public_id IS DISTINCT FROM OLD.case_public_id
        OR
        NEW.case_revision IS DISTINCT FROM OLD.case_revision
        OR
        NEW.case_content_hash IS DISTINCT FROM OLD.case_content_hash
        OR
        NEW.lab_environment_id IS DISTINCT FROM OLD.lab_environment_id
        OR
        NEW.lab_environment_public_id IS DISTINCT FROM OLD.lab_environment_public_id
        OR
        NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
        OR
        NEW.mode IS DISTINCT FROM OLD.mode
        OR
        NEW.execution_authorized IS DISTINCT FROM OLD.execution_authorized
    THEN
        RAISE EXCEPTION
            'Reality environment replay identity is immutable';
    END IF;

    IF
        OLD.experiment_run_id IS NOT NULL
        AND
        (
            NEW.experiment_run_id IS DISTINCT FROM OLD.experiment_run_id
            OR
            NEW.experiment_run_public_id IS DISTINCT FROM OLD.experiment_run_public_id
        )
    THEN
        RAISE EXCEPTION
            'Phase 21 experiment binding is immutable once established';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
    trg_reality_environment_replay_identity
ON reality.environment_replay_runs;

CREATE TRIGGER
    trg_reality_environment_replay_identity
BEFORE UPDATE
ON reality.environment_replay_runs
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_guard_environment_replay_identity();

-- ============================================================================
-- TENANT SCOPE + RLS
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_reality_environment_replay_scope
ON reality.environment_replay_runs;

CREATE TRIGGER
    trg_reality_environment_replay_scope
BEFORE INSERT OR UPDATE
ON reality.environment_replay_runs
FOR EACH ROW
EXECUTE FUNCTION
    reality.aira_validate_reality_scope();

ALTER TABLE
    reality.environment_replay_runs
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    reality.environment_replay_runs
FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
    reality_environment_replay_tenant_policy
ON reality.environment_replay_runs;

CREATE POLICY
    reality_environment_replay_tenant_policy
ON reality.environment_replay_runs
USING (
    organization_id = tenancy.current_organization_id()
    AND
    environment_id = tenancy.current_environment_id()
)
WITH CHECK (
    organization_id = tenancy.current_organization_id()
    AND
    environment_id = tenancy.current_environment_id()
    AND
    execution_authorized = FALSE
);

COMMIT;