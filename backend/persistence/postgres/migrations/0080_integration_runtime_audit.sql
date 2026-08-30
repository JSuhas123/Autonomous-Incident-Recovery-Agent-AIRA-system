-- ============================================================================
-- AIRA PHASE 20.15
-- INTEGRATION RUNTIME INVOCATION AUDIT
-- ============================================================================
--
-- Canonical append-only audit evidence for Phase 20 provider invocations.
--
-- This table stores:
--   - invocation identity
--   - tenant/environment ownership
--   - integration identity
--   - provider + operation
--   - outcome
--   - retry attempt count
--   - latency
--   - deterministic execution references when applicable
--
-- It NEVER stores credentials.
-- It NEVER grants execution authorization.
--
-- PostgreSQL is canonical integration/control-plane truth.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS integrations;


CREATE TABLE IF NOT EXISTS
    integrations.invocation_audit (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        invocation_id TEXT NOT NULL,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        connection_id UUID
            REFERENCES integrations.connections(id)
            ON DELETE SET NULL,

        integration_public_id TEXT,

        provider TEXT NOT NULL,

        operation TEXT NOT NULL,

        capability TEXT,

        outcome TEXT NOT NULL,

        attempt_count INTEGER NOT NULL
            DEFAULT 1,

        duration_ms INTEGER,

        error_code TEXT,

        authorization_id TEXT,

        execution_request_id TEXT,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT integration_invocation_audit_invocation_id_not_blank
            CHECK (
                length(
                    trim(
                        invocation_id
                    )
                ) > 0
            ),

        CONSTRAINT integration_invocation_audit_provider_not_blank
            CHECK (
                length(
                    trim(
                        provider
                    )
                ) > 0
            ),

        CONSTRAINT integration_invocation_audit_operation_not_blank
            CHECK (
                length(
                    trim(
                        operation
                    )
                ) > 0
            ),

        CONSTRAINT integration_invocation_audit_outcome_check
            CHECK (
                outcome IN (
                    'SUCCESS',
                    'PARTIAL',
                    'FAILED',
                    'BLOCKED',
                    'TIMEOUT',
                    'CIRCUIT_OPEN'
                )
            ),

        CONSTRAINT integration_invocation_audit_attempt_count_check
            CHECK (
                attempt_count > 0
            ),

        CONSTRAINT integration_invocation_audit_duration_check
            CHECK (
                duration_ms IS NULL
                OR duration_ms >= 0
            ),

        CONSTRAINT integration_invocation_audit_never_authorizes
            CHECK (
                execution_authorized = FALSE
            ),

        CONSTRAINT integration_invocation_audit_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_integration_invocation_audit_scope_time
ON integrations.invocation_audit (
    organization_id,
    environment_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_integration_invocation_audit_connection
ON integrations.invocation_audit (
    connection_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_integration_invocation_audit_invocation
ON integrations.invocation_audit (
    invocation_id
);


CREATE INDEX IF NOT EXISTS
    idx_integration_invocation_audit_provider_operation
ON integrations.invocation_audit (
    provider,
    operation,
    created_at DESC
);


CREATE OR REPLACE FUNCTION
    integrations.aira_validate_invocation_audit_scope()
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
            'integration invocation audit environment does not exist';
    END IF;

    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'integration invocation audit organization mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_integration_invocation_audit_scope
ON integrations.invocation_audit;


CREATE TRIGGER
    trg_integration_invocation_audit_scope
BEFORE INSERT
ON integrations.invocation_audit
FOR EACH ROW
EXECUTE FUNCTION
    integrations.aira_validate_invocation_audit_scope();


CREATE OR REPLACE FUNCTION
    integrations.aira_reject_invocation_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'integration invocation audit is append-only';
END;
$$;


DROP TRIGGER IF EXISTS
    trg_integration_invocation_audit_no_update
ON integrations.invocation_audit;


CREATE TRIGGER
    trg_integration_invocation_audit_no_update
BEFORE UPDATE
ON integrations.invocation_audit
FOR EACH ROW
EXECUTE FUNCTION
    integrations.aira_reject_invocation_audit_mutation();


DROP TRIGGER IF EXISTS
    trg_integration_invocation_audit_no_delete
ON integrations.invocation_audit;


CREATE TRIGGER
    trg_integration_invocation_audit_no_delete
BEFORE DELETE
ON integrations.invocation_audit
FOR EACH ROW
EXECUTE FUNCTION
    integrations.aira_reject_invocation_audit_mutation();


ALTER TABLE
    integrations.invocation_audit
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    integrations.invocation_audit
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    integration_invocation_audit_select_policy
ON integrations.invocation_audit;


CREATE POLICY
    integration_invocation_audit_select_policy
ON integrations.invocation_audit
FOR SELECT
USING (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()
);


DROP POLICY IF EXISTS
    integration_invocation_audit_insert_policy
ON integrations.invocation_audit;


CREATE POLICY
    integration_invocation_audit_insert_policy
ON integrations.invocation_audit
FOR INSERT
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()

    AND

    environment_id =
        tenancy.current_environment_id()

    AND

    execution_authorized =
        FALSE
);