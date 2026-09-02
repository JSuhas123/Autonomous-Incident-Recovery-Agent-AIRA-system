-- ============================================================================
-- AIRA PHASE 23.4
-- INCIDENT HANDOFF PACKAGE
-- ============================================================================
--
-- Human handoff packages are durable, revisioned snapshots of the operational
-- knowledge available when AIRA escalates an incident to a human operator.
--
-- They are informational only.
--
-- HANDOFF != ACKNOWLEDGEMENT
-- HANDOFF != TAKEOVER
-- HANDOFF != CONTROL
-- HANDOFF != EXECUTION AUTHORIZATION
--
-- PostgreSQL remains authoritative.
-- ============================================================================


BEGIN;


-- ============================================================================
-- HANDOFF PACKAGES
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    human_operations.incident_handoff_packages (
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

        escalation_id TEXT NOT NULL,

        task_id TEXT,

        revision INTEGER NOT NULL,

        is_current BOOLEAN NOT NULL
            DEFAULT TRUE,

        status TEXT NOT NULL
            DEFAULT 'CURRENT',

        generation_reason TEXT NOT NULL
            DEFAULT 'ESCALATION',

        schema_version TEXT NOT NULL
            DEFAULT '23.4.1',

        content_hash TEXT NOT NULL,

        package JSONB NOT NULL,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        generated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        superseded_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT incident_handoff_public_id_unique
            UNIQUE (
                public_id
            ),

        CONSTRAINT incident_handoff_scope_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                id
            ),

        CONSTRAINT incident_handoff_revision_unique
            UNIQUE (
                organization_id,
                environment_id,
                escalation_id,
                revision
            ),

        CONSTRAINT incident_handoff_revision_positive
            CHECK (
                revision >= 1
            ),

        CONSTRAINT incident_handoff_status_check
            CHECK (
                status IN (
                    'CURRENT',
                    'SUPERSEDED'
                )
            ),

        CONSTRAINT incident_handoff_package_object
            CHECK (
                jsonb_typeof(
                    package
                ) = 'object'
            ),

        CONSTRAINT incident_handoff_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT incident_handoff_hash_nonempty
            CHECK (
                length(
                    trim(
                        content_hash
                    )
                ) > 0
            ),

        CONSTRAINT incident_handoff_schema_nonempty
            CHECK (
                length(
                    trim(
                        schema_version
                    )
                ) > 0
            ),

        CONSTRAINT incident_handoff_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


-- ============================================================================
-- EXACTLY ONE CURRENT PACKAGE PER ESCALATION
-- ============================================================================


CREATE UNIQUE INDEX IF NOT EXISTS
    idx_incident_handoff_current_per_escalation
ON human_operations.incident_handoff_packages (
    organization_id,
    environment_id,
    escalation_id
)
WHERE is_current = TRUE;


-- ============================================================================
-- QUERY INDEXES
-- ============================================================================


CREATE INDEX IF NOT EXISTS
    idx_incident_handoff_incident_history
ON human_operations.incident_handoff_packages (
    organization_id,
    environment_id,
    incident_id,
    revision DESC
);


CREATE INDEX IF NOT EXISTS
    idx_incident_handoff_escalation_history
ON human_operations.incident_handoff_packages (
    organization_id,
    environment_id,
    escalation_id,
    revision DESC
);


CREATE INDEX IF NOT EXISTS
    idx_incident_handoff_task
ON human_operations.incident_handoff_packages (
    organization_id,
    environment_id,
    task_id
)
WHERE task_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_incident_handoff_content_hash
ON human_operations.incident_handoff_packages (
    organization_id,
    environment_id,
    content_hash
);


CREATE INDEX IF NOT EXISTS
    idx_incident_handoff_package_gin
ON human_operations.incident_handoff_packages
USING GIN (
    package
);


-- ============================================================================
-- ORGANIZATION / ENVIRONMENT SCOPE VALIDATION
-- ============================================================================


CREATE OR REPLACE FUNCTION
    human_operations.aira_validate_incident_handoff_scope()
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
            'incident handoff environment does not exist';
    END IF;


    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'incident handoff organization/environment mismatch';
    END IF;


    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_incident_handoff_scope
ON human_operations.incident_handoff_packages;


CREATE TRIGGER
    trg_incident_handoff_scope
BEFORE INSERT OR UPDATE
ON human_operations.incident_handoff_packages
FOR EACH ROW
EXECUTE FUNCTION
    human_operations.aira_validate_incident_handoff_scope();


-- ============================================================================
-- RLS
-- ============================================================================


ALTER TABLE
    human_operations.incident_handoff_packages
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    human_operations.incident_handoff_packages
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    incident_handoff_tenant_policy
ON human_operations.incident_handoff_packages;


CREATE POLICY
    incident_handoff_tenant_policy
ON human_operations.incident_handoff_packages
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