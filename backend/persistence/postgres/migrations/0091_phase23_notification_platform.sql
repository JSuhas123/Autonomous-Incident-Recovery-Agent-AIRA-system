-- ============================================================================
-- AIRA PHASE 23.3A + 23.3B
-- HUMAN ESCALATION NOTIFICATION PLATFORM
-- ============================================================================
--
-- PostgreSQL owns durable notification request / attempt state.
-- Workflow Outbox owns durable broker handoff intent.
-- RabbitMQ owns asynchronous transport.
--
-- NOTIFICATION != ACKNOWLEDGEMENT
-- NOTIFICATION != HUMAN CONTROL
-- NOTIFICATION != EXECUTION AUTHORIZATION
-- ============================================================================


BEGIN;


-- ============================================================================
-- NOTIFICATION REQUESTS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    notifications.requests (
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

        human_task_id TEXT,

        assignment_id TEXT,

        notification_event_type TEXT NOT NULL,

        severity TEXT NOT NULL
            DEFAULT 'HIGH',

        status TEXT NOT NULL
            DEFAULT 'PENDING_OUTBOX',

        attempt_count INTEGER NOT NULL
            DEFAULT 0,

        max_attempts INTEGER NOT NULL
            DEFAULT 3,

        target_type TEXT,

        target_ref TEXT,

        target_snapshot JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        title TEXT NOT NULL,

        message TEXT NOT NULL,

        payload JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        outbox_event_id TEXT,

        outbox_event_key TEXT,

        correlation_id TEXT,

        acknowledgement_deadline TIMESTAMPTZ,

        queued_at TIMESTAMPTZ,

        delivered_at TIMESTAMPTZ,

        failed_at TIMESTAMPTZ,

        dead_lettered_at TIMESTAMPTZ,

        cancelled_at TIMESTAMPTZ,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT notification_request_public_id_unique
            UNIQUE (public_id),

        CONSTRAINT notification_request_scope_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                id
            ),

        CONSTRAINT notification_request_escalation_identity_unique
            UNIQUE (
                organization_id,
                environment_id,
                escalation_id,
                notification_event_type,
                target_ref
            ),

        CONSTRAINT notification_request_event_type_check
            CHECK (
                notification_event_type IN (
                    'HUMAN_ESCALATION_REQUIRED',
                    'HUMAN_ESCALATION_RETRY',
                    'HUMAN_ESCALATION_EXHAUSTED'
                )
            ),

        CONSTRAINT notification_request_status_check
            CHECK (
                status IN (
                    'PENDING_OUTBOX',
                    'QUEUED',
                    'DELIVERING',
                    'DELIVERED',
                    'FAILED',
                    'DEAD_LETTER',
                    'CANCELLED'
                )
            ),

        CONSTRAINT notification_request_severity_check
            CHECK (
                severity IN (
                    'CRITICAL',
                    'HIGH',
                    'MEDIUM',
                    'LOW',
                    'INFO'
                )
            ),

        CONSTRAINT notification_request_attempt_nonnegative
            CHECK (
                attempt_count >= 0
            ),

        CONSTRAINT notification_request_max_attempt_positive
            CHECK (
                max_attempts > 0
            ),

        CONSTRAINT notification_request_target_snapshot_object
            CHECK (
                jsonb_typeof(
                    target_snapshot
                ) = 'object'
            ),

        CONSTRAINT notification_request_payload_object
            CHECK (
                jsonb_typeof(
                    payload
                ) = 'object'
            ),

        CONSTRAINT notification_request_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            ),

        CONSTRAINT notification_request_title_nonempty
            CHECK (
                length(
                    trim(
                        title
                    )
                ) > 0
            ),

        CONSTRAINT notification_request_message_nonempty
            CHECK (
                length(
                    trim(
                        message
                    )
                ) > 0
            ),

        CONSTRAINT notification_request_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_notification_requests_incident
ON notifications.requests (
    organization_id,
    environment_id,
    incident_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_notification_requests_escalation
ON notifications.requests (
    organization_id,
    environment_id,
    escalation_id,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_notification_requests_status
ON notifications.requests (
    organization_id,
    environment_id,
    status,
    created_at
);


-- ============================================================================
-- DELIVERY ATTEMPTS
-- ============================================================================


CREATE TABLE IF NOT EXISTS
    notifications.delivery_attempts (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL,

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        notification_request_id UUID NOT NULL,

        attempt_number INTEGER NOT NULL,

        status TEXT NOT NULL
            DEFAULT 'STARTED',

        provider TEXT,

        integration_id TEXT,

        channel_type TEXT,

        destination_ref TEXT,

        broker_message_id TEXT,

        provider_result JSONB,

        failure JSONB,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        started_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        completed_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT notification_attempt_public_id_unique
            UNIQUE (public_id),

        CONSTRAINT notification_attempt_scope_id_unique
            UNIQUE (
                organization_id,
                environment_id,
                id
            ),

        CONSTRAINT notification_attempt_request_scope_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                notification_request_id
            )
            REFERENCES notifications.requests (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT notification_attempt_identity_unique
            UNIQUE (
                organization_id,
                environment_id,
                notification_request_id,
                attempt_number
            ),

        CONSTRAINT notification_attempt_number_positive
            CHECK (
                attempt_number > 0
            ),

        CONSTRAINT notification_attempt_status_check
            CHECK (
                status IN (
                    'STARTED',
                    'DELIVERED',
                    'FAILED',
                    'SKIPPED'
                )
            ),

        CONSTRAINT notification_attempt_provider_result_object
            CHECK (
                provider_result IS NULL
                OR
                jsonb_typeof(
                    provider_result
                ) = 'object'
            ),

        CONSTRAINT notification_attempt_failure_object
            CHECK (
                failure IS NULL
                OR
                jsonb_typeof(
                    failure
                ) = 'object'
            ),

        CONSTRAINT notification_attempt_never_authorizes_execution
            CHECK (
                execution_authorized = FALSE
            )
    );


CREATE INDEX IF NOT EXISTS
    idx_notification_delivery_attempts_request
ON notifications.delivery_attempts (
    organization_id,
    environment_id,
    notification_request_id,
    attempt_number
);


-- ============================================================================
-- SCOPE VALIDATION
-- ============================================================================


CREATE OR REPLACE FUNCTION
    notifications.aira_validate_phase23_notification_scope()
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
            'notification environment does not exist';
    END IF;

    IF actual_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION
            'notification organization/environment mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_phase23_notification_request_scope
ON notifications.requests;


CREATE TRIGGER
    trg_phase23_notification_request_scope
BEFORE INSERT OR UPDATE
ON notifications.requests
FOR EACH ROW
EXECUTE FUNCTION
    notifications.aira_validate_phase23_notification_scope();


DROP TRIGGER IF EXISTS
    trg_phase23_notification_attempt_scope
ON notifications.delivery_attempts;


CREATE TRIGGER
    trg_phase23_notification_attempt_scope
BEFORE INSERT OR UPDATE
ON notifications.delivery_attempts
FOR EACH ROW
EXECUTE FUNCTION
    notifications.aira_validate_phase23_notification_scope();


-- ============================================================================
-- UPDATED_AT
-- ============================================================================


DROP TRIGGER IF EXISTS
    trg_phase23_notification_request_updated_at
ON notifications.requests;


CREATE TRIGGER
    trg_phase23_notification_request_updated_at
BEFORE UPDATE
ON notifications.requests
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();


-- ============================================================================
-- RLS
-- ============================================================================


ALTER TABLE
    notifications.requests
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    notifications.requests
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    notifications.delivery_attempts
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    notifications.delivery_attempts
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    phase23_notification_request_tenant_policy
ON notifications.requests;


CREATE POLICY
    phase23_notification_request_tenant_policy
ON notifications.requests
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


DROP POLICY IF EXISTS
    phase23_notification_attempt_tenant_policy
ON notifications.delivery_attempts;


CREATE POLICY
    phase23_notification_attempt_tenant_policy
ON notifications.delivery_attempts
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