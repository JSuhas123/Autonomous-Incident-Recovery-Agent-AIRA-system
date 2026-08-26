-- ============================================================================
-- AIRA PHASE 14.13
-- AUDIT COMPLETENESS / SECURITY CERTIFICATION
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS audit_control;


CREATE TABLE IF NOT EXISTS audit_control.audit_requirements (
    event_type TEXT PRIMARY KEY,

    category TEXT NOT NULL,

    severity TEXT NOT NULL
        DEFAULT 'MEDIUM',

    required BOOLEAN NOT NULL
        DEFAULT TRUE,

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT audit_requirement_severity_check
        CHECK (
            severity IN (
                'CRITICAL',
                'HIGH',
                'MEDIUM',
                'LOW'
            )
        )
);


CREATE TABLE IF NOT EXISTS audit_control.audit_certification_runs (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    requested_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    integrity_valid BOOLEAN NOT NULL,

    event_type_coverage_valid BOOLEAN NOT NULL,

    required_event_types INTEGER NOT NULL
        DEFAULT 0,

    observed_event_types INTEGER NOT NULL
        DEFAULT 0,

    missing_event_types JSONB NOT NULL
        DEFAULT '[]'::jsonb,

    report JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT audit_certification_public_unique
        UNIQUE (public_id),

    CONSTRAINT audit_certification_missing_array
        CHECK (
            jsonb_typeof(
                missing_event_types
            ) = 'array'
        )
);


CREATE INDEX IF NOT EXISTS
    idx_audit_certification_org
ON audit_control.audit_certification_runs (
    organization_id,
    created_at DESC
);