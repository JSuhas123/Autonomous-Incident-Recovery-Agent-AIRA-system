-- ============================================================================
-- AIRA PHASE 14.8
-- TENANT RUNTIME / AUTONOMY SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenancy.organization_runtime_settings (
    organization_id UUID PRIMARY KEY
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    autonomy_mode TEXT NOT NULL
        DEFAULT 'approval_required',

    allow_autonomous_recovery BOOLEAN NOT NULL
        DEFAULT FALSE,

    allow_production_autonomy BOOLEAN NOT NULL
        DEFAULT FALSE,

    require_approval_for_destructive_actions BOOLEAN NOT NULL
        DEFAULT TRUE,

    require_approval_for_production BOOLEAN NOT NULL
        DEFAULT TRUE,

    minimum_confidence_for_autonomy NUMERIC(5,4) NOT NULL
        DEFAULT 0.9500,

    maximum_actions_per_incident INTEGER NOT NULL
        DEFAULT 10,

    maximum_concurrent_executions INTEGER NOT NULL
        DEFAULT 3,

    execution_timeout_seconds INTEGER NOT NULL
        DEFAULT 900,

    verification_required BOOLEAN NOT NULL
        DEFAULT TRUE,

    rollback_required_when_available BOOLEAN NOT NULL
        DEFAULT TRUE,

    freeze_on_repeated_failure BOOLEAN NOT NULL
        DEFAULT TRUE,

    repeated_failure_threshold INTEGER NOT NULL
        DEFAULT 3,

    notification_defaults JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    execution_restrictions JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    updated_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT organization_runtime_autonomy_mode_check
        CHECK (
            autonomy_mode IN (
                'observe_only',
                'recommend_only',
                'approval_required',
                'autonomous'
            )
        ),

    CONSTRAINT organization_runtime_confidence_check
        CHECK (
            minimum_confidence_for_autonomy >= 0
            AND
            minimum_confidence_for_autonomy <= 1
        ),

    CONSTRAINT organization_runtime_actions_check
        CHECK (
            maximum_actions_per_incident > 0
        ),

    CONSTRAINT organization_runtime_concurrency_check
        CHECK (
            maximum_concurrent_executions > 0
        ),

    CONSTRAINT organization_runtime_failure_threshold_check
        CHECK (
            repeated_failure_threshold > 0
        )
);


CREATE TABLE IF NOT EXISTS tenancy.environment_runtime_settings (
    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    environment_id UUID PRIMARY KEY
        REFERENCES tenancy.environments(id)
        ON DELETE CASCADE,

    autonomy_mode TEXT,

    allow_autonomous_recovery BOOLEAN,

    require_approval_for_destructive_actions BOOLEAN,

    minimum_confidence_for_autonomy NUMERIC(5,4),

    maximum_actions_per_incident INTEGER,

    maximum_concurrent_executions INTEGER,

    execution_timeout_seconds INTEGER,

    verification_required BOOLEAN,

    rollback_required_when_available BOOLEAN,

    freeze_on_repeated_failure BOOLEAN,

    repeated_failure_threshold INTEGER,

    notification_overrides JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    execution_restriction_overrides JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    updated_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT environment_runtime_autonomy_mode_check
        CHECK (
            autonomy_mode IS NULL
            OR autonomy_mode IN (
                'observe_only',
                'recommend_only',
                'approval_required',
                'autonomous'
            )
        ),

    CONSTRAINT environment_runtime_confidence_check
        CHECK (
            minimum_confidence_for_autonomy IS NULL
            OR (
                minimum_confidence_for_autonomy >= 0
                AND
                minimum_confidence_for_autonomy <= 1
            )
        )
);


CREATE OR REPLACE FUNCTION
    tenancy.aira_validate_environment_runtime_scope()
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
            'environment does not exist';
    END IF;

    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'environment runtime settings organization mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_environment_runtime_scope
ON tenancy.environment_runtime_settings;


CREATE TRIGGER
    trg_environment_runtime_scope
BEFORE INSERT OR UPDATE
ON tenancy.environment_runtime_settings
FOR EACH ROW
EXECUTE FUNCTION
    tenancy.aira_validate_environment_runtime_scope();


DROP TRIGGER IF EXISTS
    trg_organization_runtime_settings_updated_at
ON tenancy.organization_runtime_settings;


CREATE TRIGGER
    trg_organization_runtime_settings_updated_at
BEFORE UPDATE
ON tenancy.organization_runtime_settings
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_environment_runtime_settings_updated_at
ON tenancy.environment_runtime_settings;


CREATE TRIGGER
    trg_environment_runtime_settings_updated_at
BEFORE UPDATE
ON tenancy.environment_runtime_settings
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();