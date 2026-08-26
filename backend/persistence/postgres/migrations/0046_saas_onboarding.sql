-- ============================================================================
-- AIRA PHASE 14.12
-- SAAS ONBOARDING CONTROL PLANE
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS onboarding;


CREATE TABLE IF NOT EXISTS onboarding.organization_onboarding (
    organization_id UUID PRIMARY KEY
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL
        DEFAULT 'IN_PROGRESS',

    current_step TEXT NOT NULL
        DEFAULT 'ORGANIZATION_PROFILE',

    completion_percent INTEGER NOT NULL
        DEFAULT 0,

    started_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    completed_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    completed_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT onboarding_status_check
        CHECK (
            status IN (
                'IN_PROGRESS',
                'COMPLETED',
                'PAUSED'
            )
        ),

    CONSTRAINT onboarding_progress_check
        CHECK (
            completion_percent >= 0
            AND
            completion_percent <= 100
        )
);


CREATE TABLE IF NOT EXISTS onboarding.organization_onboarding_steps (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    step_key TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'PENDING',

    required BOOLEAN NOT NULL
        DEFAULT TRUE,

    completed_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    completed_at TIMESTAMPTZ,

    skipped_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    skipped_at TIMESTAMPTZ,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT onboarding_step_org_unique
        UNIQUE (
            organization_id,
            step_key
        ),

    CONSTRAINT onboarding_step_status_check
        CHECK (
            status IN (
                'PENDING',
                'IN_PROGRESS',
                'COMPLETED',
                'SKIPPED'
            )
        )
);


CREATE INDEX IF NOT EXISTS
    idx_onboarding_steps_org_status
ON onboarding.organization_onboarding_steps (
    organization_id,
    status
);


DROP TRIGGER IF EXISTS
    trg_onboarding_updated_at
ON onboarding.organization_onboarding;


CREATE TRIGGER
    trg_onboarding_updated_at
BEFORE UPDATE
ON onboarding.organization_onboarding
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
    trg_onboarding_steps_updated_at
ON onboarding.organization_onboarding_steps;


CREATE TRIGGER
    trg_onboarding_steps_updated_at
BEFORE UPDATE
ON onboarding.organization_onboarding_steps
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();